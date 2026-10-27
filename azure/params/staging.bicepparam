using '../app/app.bicep'

param appName = 'nodeapp-staging'
param containerAppsEnvironmentName = 'cae-nodeapp-staging'
param envLabel = 'staging'
param revisionMode = 'Single'
param minReplicas = 1
param maxReplicas = 1
param cpu = '0.5'
param memory = '1Gi'

param appVersion  =''
param identityId  =''
param imageName = ''
param revisionSuffix  =''
