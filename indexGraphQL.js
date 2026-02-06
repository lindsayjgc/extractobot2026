const inquirer = require('inquirer');
const Table = require('cli-table3');
const createConfig = require('./1-getStarted');
const CollibraClient = require('./collibraClient');
const CollibraExporter = require('./collibraExporter');
const CollibraGraphQLExporter = require('./collibraGraphQLExporter');

const displayWelcome = () => {
  console.clear();
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Collibra Community Export Tool       ║');
  console.log('║          REST API + GraphQL            ║');
  console.log('╚════════════════════════════════════════╝\n');
};

const displayCommunities = (communities) => {
  const table = new Table({
    head: ['#', 'Community Name', 'Description'],
    colWidths: [5, 40, 50],
    wordWrap: true
  });

  communities.forEach((comm, index) => {
    table.push([
      index + 1,
      comm.name,
      comm.description || 'No description'
    ]);
  });

  console.log(table.toString());
  console.log(`\nTotal communities: ${communities.length}\n`);
};

const selectCommunities = async (communities) => {
  const choices = communities.map((comm, index) => ({
    name: `${comm.name}${comm.description ? ` - ${comm.description.substring(0, 60)}` : ''}`,
    value: index,
    short: comm.name
  }));

  const { selectedIndices } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedIndices',
      message: 'Select communities to export (use space to select, enter to confirm):',
      choices,
      pageSize: 15
    }
  ]);

  return selectedIndices.map(index => communities[index]);
};

const configureExportOptions = async (useGraphQL = false) => {
  const questions = [
    {
      type: 'confirm',
      name: 'includeAssets',
      message: 'Include assets?',
      default: true
    }
  ];

  if (useGraphQL) {
    // GraphQL-specific options
    questions.push(
      {
        type: 'confirm',
        name: 'includeAttributes',
        message: 'Include all asset attributes (string, numeric, date, etc.)?',
        default: true,
        when: (answers) => answers.includeAssets
      },
      {
        type: 'confirm',
        name: 'includeRelations',
        message: 'Include asset relations (incoming & outgoing)?',
        default: true,
        when: (answers) => answers.includeAssets
      },
      {
        type: 'confirm',
        name: 'includeResponsibilities',
        message: 'Include asset responsibilities (stewards, owners)?',
        default: false,
        when: (answers) => answers.includeAssets
      }
    );
  } else {
    // REST API options
    questions.push(
      {
        type: 'confirm',
        name: 'includeAttributes',
        message: 'Include asset attributes?',
        default: true,
        when: (answers) => answers.includeAssets
      },
      {
        type: 'confirm',
        name: 'includeRelations',
        message: 'Include asset relations?',
        default: false,
        when: (answers) => answers.includeAssets
      },
      {
        type: 'confirm',
        name: 'includeResponsibilities',
        message: 'Include asset responsibilities (stewards, owners, etc.)?',
        default: false,
        when: (answers) => answers.includeAssets
      }
    );
  }

  questions.push({
    type: 'input',
    name: 'outputDir',
    message: 'Output directory:',
    default: './exports'
  });

  const answers = await inquirer.prompt(questions);
  return answers;
};

const main = async () => {
  try {
    displayWelcome();

    // Check if config exists, if not create it
    await createConfig();

    console.log('\n🔌 Connecting to Collibra...\n');

    // Initialize client
    const client = new CollibraClient();
    client.loadConfig();
    
    const authenticated = await client.authenticate();
    if (!authenticated) {
      console.error('Failed to authenticate. Please check your credentials.');
      process.exit(1);
    }

    // Choose export method
    const { exportMethod } = await inquirer.prompt([
      {
        type: 'list',
        name: 'exportMethod',
        message: 'Choose export method:',
        choices: [
          { name: '⚡ GraphQL (Recommended - Faster, single query per community)', value: 'graphql' },
          { name: '🔧 REST API (Traditional - Multiple API calls)', value: 'rest' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    if (exportMethod === 'exit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    const useGraphQL = exportMethod === 'graphql';

    if (useGraphQL) {
      // GraphQL Export Flow
      console.log('\n📋 Enter community or domain name to export:\n');
      
      const { exportType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'exportType',
          message: 'What would you like to export?',
          choices: [
            { name: 'Community (all domains in a community)', value: 'community' },
            { name: 'Domain (single domain only)', value: 'domain' },
            { name: 'Back to method selection', value: 'back' }
          ]
        }
      ]);

      if (exportType === 'back') {
        return main(); // Restart
      }

      const { targetName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'targetName',
          message: `Enter ${exportType} name (exact match):`,
          validate: (input) => input.trim().length > 0 ? true : 'Name cannot be empty'
        }
      ]);

      // Configure export options
      console.log('\n⚙️  Export Options\n');
      const exportOptions = await configureExportOptions(true);

      // Confirm export
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Ready to export ${exportType} "${targetName}" via GraphQL?`,
          default: true
        }
      ]);

      if (!confirm) {
        console.log('Export cancelled.');
        process.exit(0);
      }

      // Perform GraphQL export
      console.log('\n🚀 Starting GraphQL export...\n');
      const graphQLExporter = new CollibraGraphQLExporter(client);
      
      if (exportType === 'community') {
        await graphQLExporter.exportCommunityByName(targetName, exportOptions);
      } else {
        await graphQLExporter.exportDomainByName(targetName, exportOptions);
      }

    } else {
      // REST API Export Flow
      console.log('📋 Fetching communities...\n');
      const communitiesResponse = await client.getCommunities();
      const communities = communitiesResponse.results || [];

      if (communities.length === 0) {
        console.log('No communities found in your Collibra instance.');
        process.exit(0);
      }

      // Display communities
      displayCommunities(communities);

      // Main menu
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Select specific communities to export', value: 'select' },
            { name: 'Export all communities', value: 'all' },
            { name: 'Exit', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        console.log('Goodbye!');
        process.exit(0);
      }

      // Select communities
      let selectedCommunities;
      if (action === 'select') {
        selectedCommunities = await selectCommunities(communities);
        if (selectedCommunities.length === 0) {
          console.log('No communities selected. Exiting.');
          process.exit(0);
        }
      } else {
        selectedCommunities = communities;
      }

      // Configure export options
      console.log('\n⚙️  Export Options\n');
      const exportOptions = await configureExportOptions(false);

      // Confirm export
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Ready to export ${selectedCommunities.length} communit${selectedCommunities.length === 1 ? 'y' : 'ies'} via REST API?`,
          default: true
        }
      ]);

      if (!confirm) {
        console.log('Export cancelled.');
        process.exit(0);
      }

      // Perform REST export
      console.log('\n🚀 Starting REST API export...\n');
      const exporter = new CollibraExporter(client);
      
      if (selectedCommunities.length === 1) {
        await exporter.exportCommunity(selectedCommunities[0], exportOptions);
      } else {
        const results = await exporter.exportMultipleCommunities(selectedCommunities, exportOptions);
        
        console.log('\n📊 Export Summary:');
        results.forEach(result => {
          const status = result.success ? '✓' : '✗';
          console.log(`  ${status} ${result.community}`);
          if (!result.success) {
            console.log(`    Error: ${result.error}`);
          }
        });
      }
    }

    console.log('\n✨ All done!\n');

  } catch (error) {
    console.error('\n❌ An error occurred:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.error(error.stack);
    process.exit(1);
  }
};

// Run the application
main();
