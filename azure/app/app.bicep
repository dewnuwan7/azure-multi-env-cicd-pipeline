
param location string = resourceGroup().location
param containerAppsEnvironmentName string
param appName string = 'nodeapp'
param envLabel string
param imageName string
param appVersion string
param revisionSuffix string
param identityId string
param registryServer string = 'thesudofiles.azurecr.io'

@allowed(['Single', 'Multiple'])
param revisionMode string = 'Single'

param minReplicas int = 1
param maxReplicas int = 2
param cpu string = '0.5'
param memory string = '1Gi'

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: revisionMode
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        // First deploy in Multiple mode gives the blue label 100% of traffic.
        // In Single mode, the newest revision takes all traffic.
        traffic: revisionMode == 'Multiple'
          ? [
              {
                latestRevision: true
                weight: 100
                label: 'blue'
              }
            ]
          : [
              {
                latestRevision: true
                weight: 100
              }
            ]
      }
      registries: [
        {
          server: registryServer
          identity: identityId
        }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: appName
          image: imageName
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            { name: 'ENVIRONMENT', value: envLabel }
            { name: 'APP_VERSION', value: appVersion }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 3000 }
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 3000 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output appFqdn string = app.properties.configuration.ingress.fqdn
