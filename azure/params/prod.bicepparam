using '../app/app.bicep'

param appName = 'nodeapp-prod'
param containerAppsEnvironmentName = 'cae-nodeapp-prod'
param envLabel = 'prod'
param revisionMode = 'Multiple'
param minReplicas = 1
param maxReplicas = 2
param cpu = '0.5'
param memory = '1Gi'

param appVersion  =''
param identityId  =''
param imageName = ''
param revisionSuffix  =''
