import { MANAGEMENT_CLUSTER } from '../config/types';

const OPERATOR_NAMESPACE = 'aif-system';
const OPERATOR_SERVICE = 'aif-operator';
const OPERATOR_PORT = 8080;

function getClusterId(): string {
  if (typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/c\/([^/]+)/);

    if (match && match[1] && match[1] !== '_') {
      return match[1];
    }
  }

  return MANAGEMENT_CLUSTER;
}

export function getApiBase(): string {
  const clusterId = getClusterId();

  return `/k8s/clusters/${ clusterId }/api/v1/namespaces/${ OPERATOR_NAMESPACE }/services/http:${ OPERATOR_SERVICE }:${ OPERATOR_PORT }/proxy`;
}
