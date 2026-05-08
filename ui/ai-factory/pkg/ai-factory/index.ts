import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';
import * as productModule from './config/aif-product';
import routes from './routing';
import './style/brand.css';

const { SteveFactory } = require('@shell/plugins/steve');

/**
 * SUSE AI Factory UI extension entry point.
 */
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json and resolve the local tile icon.
  plugin.metadata = {
    ...require('./package.json'),
    icon: require('./assets/logo.svg')
  };

  plugin.addDashboardStore('aif', SteveFactory(null, null), { namespace: 'aif', isClusterStore: true });
  plugin.addProduct(productModule as any);
  plugin.addRoutes(routes);
  plugin.addL10n('en-us', require('./l10n/en-us.yaml'));
}
