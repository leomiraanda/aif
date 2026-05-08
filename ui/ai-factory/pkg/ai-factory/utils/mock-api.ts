/**
 * Mock API responses for UI development before backend integration is ready.
 */

export const mockAPI = {
  bundles: {
    // submit, withdraw, approve, requestChanges, testDeploy, pendingReview
  },

  blueprints: {
    // versions, deploy, deprecate, withdraw, reactivate
  },

  workloads: {
    // start, stop, restart, upgrade
  },

  apps: {
    // list, categories
  },

  settings: {
    // get, update, testConnection
  }
};

export const USE_MOCK_API = process.env.USE_MOCK_API === 'true';
