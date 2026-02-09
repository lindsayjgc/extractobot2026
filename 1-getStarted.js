const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const path = require('path');
const https = require('https');

const configPath = path.join(__dirname, 'config.json');
let rl;  // Declare rl outside, so it's not duplicated.

const question = (query) => new Promise((resolve) => {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  rl.question(query, resolve);
});

const testConnectivity = async (domain, username, password) => {
  try {
    const agent = new https.Agent({rejectUnauthorized: false});
    const response = await axios.post(`https://${domain}/rest/2.0/auth/sessions`, { username, password }, {httpsAgent: agent, proxy: false});
    if (response.status === 200) {
      console.log('Authentication successful.');
      return true;
    }
  } catch (error) {
    console.error('Authentication failed:', error.message);
  }
  return false;
};

const createConfig = async () => {
  try {
    if (fs.existsSync(configPath)) {
      const useExisting = await question('config.json already exists. Do you want to use it? (yes/NO) ');
      if (useExisting.toLowerCase() === 'yes') {
        rl.close();
        return;
      }
    }

    const domain = await question('What is the URL for you Collibra instance? ');

    let username, password, authenticated = false;

    while (!authenticated) {
      username = await question('Username: ');
      password = await question('Password: ');  // Could use other secure methods for hiding password input.

      authenticated = await testConnectivity(domain, username, password);
      if (!authenticated) {
        console.log('Please enter your credentials again.');
      }
    }

    const config = {
      domain,
      apiURL: `https://${domain}/rest/2.0`,
      graphURL: `https://${domain}/graphql/knowledgeGraph/v1`,
      username,
      password
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('config.json has been created.');
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();  // Close the readline interface after use.
    rl = null;   // Reset rl to prevent input duplication in subsequent interactions.
  }
};

module.exports = createConfig;
