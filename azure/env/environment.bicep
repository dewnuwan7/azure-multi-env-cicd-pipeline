param location string = resourceGroup().location
param environment string
param appName string = 'nodeapp'


resource cae 'Microsoft.App/managedEnvironments@2026-07-01' = {
  location: location
  name: 'cae-${appName}-${environment}'
  properties: {
 
  }
}

output environmentId string = cae.id
