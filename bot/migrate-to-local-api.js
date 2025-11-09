import 'dotenv/config';
import https from 'https';

const token = process.env.TELEGRAM_BOT_TOKEN;
const apiRoot = process.env.TELEGRAM_API_ROOT;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not defined');
  process.exit(1);
}

if (!apiRoot) {
  console.log('ℹ️  TELEGRAM_API_ROOT is not set - bot will use standard API');
  process.exit(0);
}

console.log('🔄 Migrating bot to local Bot API Server...');
console.log(`   Token: ${token.substring(0, 10)}...`);
console.log(`   Local API: ${apiRoot}`);

// Step 1: Log out from standard API
const logoutUrl = `https://api.telegram.org/bot${token}/logOut`;

console.log('\n📤 Step 1: Logging out from standard Telegram API...');

https.get(logoutUrl, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.ok) {
        console.log('✅ Successfully logged out from standard API');
        console.log('\n📥 Step 2: Bot is now ready to use local API Server');
        console.log('   Restart the bot to complete migration:');
        console.log('   docker compose restart bot');
        console.log('\n✨ Migration complete! Bot will now use local API with 2GB file limit.');
      } else {
        console.log('⚠️  Logout response:', response);
        if (response.description && response.description.includes('already logged out')) {
          console.log('✅ Bot is already logged out - ready to use local API');
          console.log('   Restart the bot: docker compose restart bot');
        } else {
          console.error('❌ Failed to logout:', response.description);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', error.message);
      console.log('   Response:', data);
      process.exit(1);
    }
  });
}).on('error', (error) => {
  console.error('❌ Network error:', error.message);
  process.exit(1);
});
