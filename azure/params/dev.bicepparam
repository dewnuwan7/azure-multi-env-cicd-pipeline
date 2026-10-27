using '../app/app.bicep'

param appName = 'nodeapp-dev'
param containerAppsEnvironmentName = 'cae-nodeapp-dev'
param envLabel = 'dev'
param revisionMode = 'Single'
param minReplicas = 0
param maxReplicas = 1
param cpu = '0.25'
param memory = '0.5Gi'

param appVersion  =''
param identityId  =''
param imageName = ''
param revisionSuffix  =''
