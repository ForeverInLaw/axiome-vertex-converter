require('dotenv').config();
const { Bot } = require('grammy');
const axios = require('axios');
const { decodeTxRaw } = require('@cosmjs/proto-signing');
const { MsgSend } = require('cosmjs-types/cosmos/bank/v1beta1/tx');
const { pool } = require('./services/database');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Bot(botToken);

const AXIOME_WALLET_ADDRESS = process.env.AXIOME_WALLET_ADDRESS;
const AXIOME_API_ENDPOINT = process.env.AXIOME_API_ENDPOINT || 'https://api-chain.axiomechain.org';
const CHECK_INTERVAL_MS = 120000;
const SUBSCRIPTION_PRICE_AXM = parseFloat(process.env.SUBSCRIPTION_PRICE_AXM || '50');

async function checkTransactions() {
  console.log('Checking for new transactions...');
  try {
    const query = `transfer.recipient='${AXIOME_WALLET_ADDRESS}'`;
    const url = `${AXIOME_API_ENDPOINT}/tx_search`;

    const config = {
      params: {
        query: `"${query}"`,
        per_page: '50',
        order_by: '"desc"',
      },
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 500,
    };

    const response = await axios.get(url, config);

    if (response.status !== 200) {
      console.error(`API returned status ${response.status}`);
      return;
    }

    if (!response.data) {
      console.error('Empty response from API');
      return;
    }

    let data;
    if (typeof response.data === 'string') {
      data = JSON.parse(response.data);
    } else {
      data = response.data;
    }

    if (!data.result || !data.result.txs || data.result.txs.length === 0) {
      console.log('No new transactions found.');
      return;
    }

    console.log(`Found ${data.result.txs.length} transactions`);

    for (const tx_response of data.result.txs) {
      await processTransaction(tx_response);
    }
  } catch (error) {
    console.error('Error checking transactions:', error.message);
  }
}

async function processTransaction(tx_response) {
  const txHash = tx_response.hash;
  console.log(`Processing transaction: ${txHash}`);

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id FROM transactions WHERE transaction_hash = $1',
      [txHash]
    );

    if (result.rows.length > 0) {
      console.log(`Transaction ${txHash} already processed. Skipping.`);
      return;
    }

    const txBytes = Buffer.from(tx_response.tx, 'base64');
    const decodedTx = decodeTxRaw(txBytes);

    const memo = decodedTx.body.memo;
    const messages = decodedTx.body.messages;

    const transferMessageData = messages.find(
      (m) => m.typeUrl === '/cosmos.bank.v1beta1.MsgSend'
    );

    if (!transferMessageData || !memo) {
      return;
    }

    console.log(`Found relevant transaction with memo: ${memo}`);

    const transferMessage = MsgSend.decode(transferMessageData.value);

    const userId = parseInt(memo, 10);
    if (isNaN(userId)) {
      console.log(`Skipping tx ${txHash}: memo "${memo}" is not a valid user ID.`);
      return;
    }

    const amountData = transferMessage.amount.find((coin) => coin.denom === 'uaxm');
    if (!amountData) {
      console.log(`Skipping tx ${txHash}: no uaxm amount found.`);
      return;
    }

    const amountAXM = parseFloat(amountData.amount) / 1000000;

    if (amountAXM < SUBSCRIPTION_PRICE_AXM) {
      console.log(`Skipping tx ${txHash}: amount ${amountAXM} AXM is less than required ${SUBSCRIPTION_PRICE_AXM} AXM`);
      return;
    }

    console.log(`Valid subscription payment: ${amountAXM} AXM from user ${userId}`);

    await client.query(
      'INSERT INTO transactions (user_id, transaction_hash, amount_axm, status) VALUES ($1, $2, $3, $4)',
      [userId, txHash, amountAXM, 'completed']
    );

    try {
      const subResult = await client.query(
        'SELECT subscription_expires_at FROM users WHERE id = $1',
        [userId]
      );
      
      const expiresAt = subResult.rows[0]?.subscription_expires_at;
      const dateStr = expiresAt ? new Date(expiresAt).toLocaleDateString('ru-RU') : 'н/д';
      
      const successMessage = `✅ Подписка успешно активирована!\n\n💳 Оплачено: ${amountAXM} AXM\n📅 Действует до: ${dateStr}\n\nСпасибо за использование Axiome Vertex Converter!`;
      await bot.api.sendMessage(userId, successMessage);
      console.log(`Successfully processed transaction ${txHash} for user ${userId}.`);
    } catch (notifyError) {
      console.error(`Failed to notify user ${userId} for tx ${txHash}:`, notifyError.message);
    }
  } catch (error) {
    console.error(`Error processing transaction ${txHash}:`, error.message);
  } finally {
    client.release();
  }
}

console.log('Payment verifier started.');
console.log(`Watching for payments to wallet: ${AXIOME_WALLET_ADDRESS}`);

checkTransactions();
setInterval(checkTransactions, CHECK_INTERVAL_MS);
