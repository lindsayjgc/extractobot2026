const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

class CollibraClient {
  constructor() {
    this.config = null;
    this.authHeader = null;
  }

  loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('config.json not found. Please run setup first.');
    }
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Create Basic Auth header
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  async authenticate() {
    try {
      // Test connectivity using Basic Auth
      const agent = new https.Agent({rejectUnauthorized: false});
      const response = await axios.post(
        `https://${this.config.domain}/rest/2.0/auth/sessions`,
        {
          username: this.config.username,
          password: this.config.password
        },
        {
          httpsAgent: agent, 
          proxy: false
        }
      );
      console.log('✓ Authenticated successfully');
      return true;
    } catch (error) {
      console.error('Authentication failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Response:', error.response.data);
      }
      return false;
    }
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const agent = new https.Agent({rejectUnauthorized: false});
      const response = await axios.get(`${this.config.apiURL}${endpoint}`, {
        params,
        headers: {
          'Authorization': this.authHeader
        },
        httpsAgent: agent, 
        proxy: false
      });
      return response.data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('URL:', error.response.config.url);
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  async makeGraphQLRequest(query, variables = {}) {
    try {
      const agent = new https.Agent({rejectUnauthorized: false});
      const response = await axios.post(
        this.config.graphURL,
        { query, variables },
        {
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json'
          },
          httpsAgent: agent, 
          proxy: false
        }
      );
      return response.data;
    } catch (error) {
      console.error('GraphQL request failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  async getCommunities(params = {}) {
    const defaultParams = {
      offset: 0,
      limit: 1000,
      sortField: 'NAME',
      sortOrder: 'ASC',
      excludeMeta: true
    };
    return await this.makeRequest('/communities', { ...defaultParams, ...params });
  }

  async getDomains(communityId, params = {}) {
    const defaultParams = {
      communityId,
      offset: 0,
      limit: 1000,
      sortField: 'NAME',
      sortOrder: 'ASC',
      excludeMeta: true
    };
    return await this.makeRequest('/domains', { ...defaultParams, ...params });
  }

  async getAssets(domainId, params = {}) {
    const defaultParams = {
      domainId,
      offset: 0,
      limit: 1000,
      sortField: 'NAME',
      sortOrder: 'ASC',
      excludeMeta: true
    };
    return await this.makeRequest('/assets', { ...defaultParams, ...params });
  }

  async getAssetsByCommunity(communityId, params = {}) {
    const defaultParams = {
      communityId,
      offset: 0,
      limit: 1000,
      sortField: 'NAME',
      sortOrder: 'ASC',
      excludeMeta: true
    };
    return await this.makeRequest('/assets', { ...defaultParams, ...params });
  }

  async getAssetDetails(assetId) {
    return await this.makeRequest(`/assets/${assetId}`);
  }

  async getAssetAttributes(assetId) {
    return await this.makeRequest(`/assets/${assetId}/attributes`);
  }

  async getAssetRelations(assetId, params = {}) {
    const defaultParams = {
      offset: 0,
      limit: 1000
    };
    return await this.makeRequest(`/assets/${assetId}/relations`, { ...defaultParams, ...params });
  }

  async getAssetResponsibilities(assetId, params = {}) {
    const defaultParams = {
      offset: 0,
      limit: 1000
    };
    return await this.makeRequest(`/assets/${assetId}/responsibilities`, { ...defaultParams, ...params });
  }

  /**
   * Get all subcommunities of a given community (recursive)
   */
  async getAllSubcommunities(communityId) {
    const allCommunities = [];
    
    // Get all communities
    const response = await this.getCommunities({ limit: 1000 });
    const communities = response.results || [];
    
    // Build a map for quick lookup
    const communityMap = new Map();
    communities.forEach(comm => communityMap.set(comm.id, comm));
    
    // Recursive function to find all descendants
    const findDescendants = (parentId) => {
      const descendants = [];
      
      for (const comm of communities) {
        if (comm.parent && comm.parent.id === parentId) {
          descendants.push(comm);
          // Recursively find children of this community
          const children = findDescendants(comm.id);
          descendants.push(...children);
        }
      }
      
      return descendants;
    };
    
    // Find all descendants of the given community
    const subcommunities = findDescendants(communityId);
    
    return subcommunities;
  }

  /**
   * Get community by name (exact match)
   */
  async getCommunityByName(name) {
    const response = await this.getCommunities({ name, nameMatchMode: 'EXACT' });
    const communities = response.results || [];
    
    if (communities.length === 0) {
      return null;
    }
    
    return communities[0];
  }

  // Pagination helper - fetches all pages of results
  async fetchAllPages(endpoint, params = {}, itemsKey = 'results') {
    const allResults = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await this.makeRequest(endpoint, { ...params, offset, limit });
      const items = response[itemsKey] || [];
      allResults.push(...items);
      
      offset += limit;
      hasMore = items.length === limit; // Continue if we got a full page
      
      if (hasMore) {
        console.log(`  Fetched ${allResults.length} items, continuing...`);
      }
    }

    return allResults;
  }
}

module.exports = CollibraClient;
