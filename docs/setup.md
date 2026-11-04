# Setup from a Clone

This guide starts from a clone of the repository. The workflows, Bicep templates, parameter files, and application code are all in the repo. The commands below are the ones you run to create and check the Azure side. Application code snippets were removed, since the repo already contains them.

The design is in `docs/architecture.md`. 
Read the [Blog Post](https://medium.com/@yushan.jayaweera/building-a-multi-environment-ci-cd-pipeline-on-azure-container-apps-fd8e58458b99?sharedUserId=yushan.jayaweera).

**Used values:** region `eastus`, registry `thesudofiles`, repository `dewnuwan7/azure-multi-env-cicd-pipeline`.
If you change a name, change it in the parameter files and the workflow `env` blocks first.

---

## 1. Prerequisites

Install Git, Node.js 24, Docker Desktop (running), the Azure CLI with Bicep, and the bash CLI (use git cli).

You need an Azure subscription where you can grant roles, and admin rights on the GitHub repository.

**Check:** `node --version` prints 24.x, and `docker info` succeeds.

## 2. Clone the repository

```bash
git clone https://github.com/dewnuwan7/azure-multi-env-cicd-pipeline.git
cd azure-multi-env-cicd-pipeline
```

## 3. Install the tools and sign in

```bash
az version
az bicep install
docker --version
node --version          # 24 or newer
gh --version

az login
az account set --subscription 08b38f5b-abef-4a17-b066-261d0725cca3
az account show --query "{name:name, id:id}" -o table

gh auth login           # GitHub.com, HTTPS, browser login
gh auth status
```


**Check:** `az account show` shows the right subscription, and `gh auth status` shows you are signed in.

## 4. Register providers and check the registry name

```bash
for P in Microsoft.App Microsoft.ContainerRegistry Microsoft.ManagedIdentity Microsoft.Authorization; do
  az provider register --namespace "$P"
done
az provider show -n Microsoft.App --query registrationState -o tsv
az acr check-name -n thesudofiles --query nameAvailable -o tsv
```

**Check:** the registry name check prints `true`. Registry names are global. If it's taken, choose another name and update it everywhere it appears.

## 5. Review the Bicep templates

The templates are in `azure/`. Read them before you deploy anything, since they define the identity, the environments, and the app for all three environments.
Each environment has a parameter file in `azure/params/` that names its app and environment.
Compile every template before deploying:

```bash
az bicep build --file azure/shared/identity.bicep
az bicep build --file azure/env/environment.bicep
az bicep build --file azure/app/app.bicep
```

**Check:** no errors. Warnings are acceptable.

## 6. Create the resource groups and the registry

```bash
LOC=eastus
az group create -n rg-nodeapp-shared -l $LOC
az group create -n rg-nodeapp-dev -l $LOC
az group create -n rg-nodeapp-staging -l $LOC
az group create -n rg-nodeapp-prod -l $LOC
az group list --query "[?starts_with(name,'rg-nodeapp')].{name:name, location:location}" -o table
```

```bash
az acr create -g rg-nodeapp-shared -n thesudofiles --sku Basic -l $LOC
az acr show -n thesudofiles --query "{login:loginServer, admin:adminUserEnabled}" -o table
```

**Check:** all four groups show `eastus`, and the registry's admin user is disabled.

Confirm your account can grant roles, since the next steps need it:

```bash
MY_ID=$(az ad signed-in-user show --query id -o tsv | tr -d '\r')
ACR_ID=$(az acr show -n thesudofiles -g rg-nodeapp-shared --query id -o tsv | tr -d '\r')
az role assignment list --scope "$ACR_ID" --assignee-object-id "$MY_ID" \
  --assignee-principal-type User --query "[].roleDefinitionName" -o tsv
```

## 7. Deploy the pull identity

```bash
az deployment group create -g rg-nodeapp-shared -n identity \
  --template-file azure/shared/identity.bicep \
  --parameters azure/shared/identity.bicepparam

IDENTITY_ID=$(az deployment group show -g rg-nodeapp-shared -n identity \
  --query properties.outputs.identityId.value -o tsv | tr -d '\r')
echo "$IDENTITY_ID"
```

Confirm the role is in place. Role assignments can take a few minutes, so wait and retry if the output is empty:

```bash
PRINCIPAL=$(az identity show -g rg-nodeapp-shared -n id-nodeapp-pull --query principalId -o tsv | tr -d '\r')
ACR_ID=$(az acr show -n thesudofiles -g rg-nodeapp-shared --query id -o tsv | tr -d '\r')

az role assignment list --scope "$ACR_ID" --assignee-object-id "$PRINCIPAL" \
  --assignee-principal-type ServicePrincipal --query "[].roleDefinitionName" -o tsv
```

If the list shows assignments for an identity that no longer exists, remove them and create the current one:

```bash
az role assignment list --scope "$ACR_ID" --all \
  --query "[?roleDefinitionName=='AcrPull'].{principal:principalId, id:id}" -o table
```

```bash
az role assignment create --assignee-object-id "$PRINCIPAL" \
  --assignee-principal-type ServicePrincipal --role AcrPull --scope "$ACR_ID"
```

**Check:** the output is `AcrPull`.

## 8. Create the Container Apps environments

```bash
for ENV in dev staging prod; do
  az deployment group create -g rg-nodeapp-$ENV -n env \
    --template-file azure/env/environment.bicep \
    --parameters environmentName=cae-nodeapp-$ENV
done
```

```bash
az containerapp env list -g rg-nodeapp-prod --query "[].{name:name, location:location}" -o table
```

**Check:** each environment is listed in `eastus`.

## 9. Build and push the bootstrap image

```bash
az acr login -n thesudofiles
docker build -t thesudofiles.azurecr.io/nodeapp:bootstrap .
docker push thesudofiles.azurecr.io/nodeapp:bootstrap

IMAGE_DIGEST=$(az acr repository show -n thesudofiles --image nodeapp:bootstrap \
  --query digest -o tsv | tr -d '\r')
echo "$IMAGE_DIGEST"
IMAGE=thesudofiles.azurecr.io/nodeapp@$IMAGE_DIGEST
```

Record the digest the command prints. Deployments use the digest, not the tag, so the bootstrap step does too.

**Check:** the digest starts with `sha256:`.

## 10. Bootstrap the apps

Dev and staging, using their parameter files:

```bash
az deployment group create -g rg-nodeapp-dev -n app \
  --parameters azure/params/dev.bicepparam \
  --parameters imageName=$IMAGE identityId=$IDENTITY_ID \
               appVersion=bootstrap revisionSuffix=boot0001

az deployment group create -g rg-nodeapp-staging -n app \
  --parameters azure/params/staging.bicepparam \
  --parameters imageName=$IMAGE identityId=$IDENTITY_ID \
               appVersion=bootstrap revisionSuffix=boot0001

DEV_FQDN=$(az deployment group show -g rg-nodeapp-dev -n app \
  --query properties.outputs.appFqdn.value -o tsv | tr -d '\r')
STG_FQDN=$(az deployment group show -g rg-nodeapp-staging -n app \
  --query properties.outputs.appFqdn.value -o tsv | tr -d '\r')
curl -s "https://$DEV_FQDN/api/status"
curl -s "https://$STG_FQDN/health"
```

Production. Run this once only. Later production changes go through the pipeline, because redeploying this template resets production's traffic:

```bash
az deployment group create -g rg-nodeapp-prod -n app \
  --parameters azure/params/prod.bicepparam \
  --parameters imageName=$IMAGE identityId=$IDENTITY_ID \
               appVersion=bootstrap revisionSuffix=boot0001

PROD_FQDN=$(az deployment group show -g rg-nodeapp-prod -n app \
  --query properties.outputs.appFqdn.value -o tsv | tr -d '\r')
curl -s "https://$PROD_FQDN/health"
```

Check production's traffic table. The `blue` label and the revision `nodeapp-prod--boot0001` should share one row, at 100%:

```bash
az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod -o table
```

If they don't share a row, reattach the label:

```bash
az containerapp revision label add -g rg-nodeapp-prod -n nodeapp-prod \
  --label blue --revision nodeapp-prod--boot0001 --yes
az containerapp ingress traffic set -g rg-nodeapp-prod -n nodeapp-prod --label-weight blue=100
```

Then confirm that a new revision takes no traffic when it's created:

```bash
LIVE_REV=$(az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod \
  --query "[?weight==\`100\`].revisionName | [0]" -o tsv | tr -d '\r')
echo "Live: $LIVE_REV"

az containerapp ingress traffic set -g rg-nodeapp-prod -n nodeapp-prod --revision-weight "$LIVE_REV=100"
az containerapp update -g rg-nodeapp-prod -n nodeapp-prod \
  --image "$IMAGE" --revision-suffix test0002 --set-env-vars APP_VERSION=test0002

az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod -o table
az containerapp revision deactivate -g rg-nodeapp-prod -n nodeapp-prod --revision nodeapp-prod--test0002
```

**Check:** the test revision shows 0%, and the live revision keeps 100%.

## 11. Create the deploy identity

Create the Entra app registration `github-nodeapp`, with no client secret:

```bash
SUB=08b38f5b-abef-4a17-b066-261d0725cca3
TENANT=$(az account show --query tenantId -o tsv | tr -d '\r')
ACR_ID=$(az acr show -n thesudofiles -g rg-nodeapp-shared --query id -o tsv | tr -d '\r')
PULL_SCOPE=$(az identity show -g rg-nodeapp-shared -n id-nodeapp-pull --query id -o tsv | tr -d '\r')

APP_ID=$(az ad app create --display-name github-nodeapp --query appId -o tsv | tr -d '\r')
az ad sp create --id "$APP_ID"
SP_OBJ=$(az ad sp show --id "$APP_ID" --query id -o tsv | tr -d '\r')
```

Grant its roles:

```bash
for RG in rg-nodeapp-dev rg-nodeapp-staging rg-nodeapp-prod; do
  az role assignment create --assignee-object-id "$SP_OBJ" \
    --assignee-principal-type ServicePrincipal \
    --role Contributor --scope "/subscriptions/$SUB/resourceGroups/$RG"
done

az role assignment create --assignee-object-id "$SP_OBJ" \
  --assignee-principal-type ServicePrincipal --role AcrPush --scope "$ACR_ID"

az role assignment create --assignee-object-id "$SP_OBJ" \
  --assignee-principal-type ServicePrincipal \
  --role "Managed Identity Operator" --scope "$PULL_SCOPE"
```

Check the role list:

```bash
az role assignment list --assignee-object-id "$SP_OBJ" --all \
  --query "[].{role:roleDefinitionName, scope:scope}" -o table
```

GitHub's subject includes numeric owner and repository IDs. Read them rather than typing them:

```bash
OWNER_ID=$(gh api users/dewnuwan7 --jq .id)
REPO_ID=$(gh api repos/dewnuwan7/azure-multi-env-cicd-pipeline --jq .id)
echo "owner id: $OWNER_ID   repo id: $REPO_ID"
```

Create the four federated credentials, one per subject:

```bash
REPO_KEY="dewnuwan7@${OWNER_ID}/azure-multi-env-cicd-pipeline@${REPO_ID}"

declare -A SUBJECTS=(
  ["gh-main"]="repo:${REPO_KEY}:ref:refs/heads/main"
  ["gh-env-dev"]="repo:${REPO_KEY}:environment:dev"
  ["gh-env-staging"]="repo:${REPO_KEY}:environment:staging"
  ["gh-env-prod"]="repo:${REPO_KEY}:environment:production"
)

for NAME in "${!SUBJECTS[@]}"; do
  cat > fc.json <<EOF
{
  "name": "${NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "${SUBJECTS[$NAME]}",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
  az ad app federated-credential create --id "$APP_ID" --parameters @fc.json
done
rm -f fc.json

az ad app federated-credential list --id "$APP_ID" --query "[].{name:name, subject:subject}" -o table
```

**Check:** the app has four federated credentials, and the subjects match what GitHub sends in a failed run's log.

## 12. Set the repository variables

```bash
export MSYS_NO_PATHCONV=1
IDENTITY_ID=$(az identity show -g rg-nodeapp-shared -n id-nodeapp-pull --query id -o tsv | tr -d '\r')
REPO=dewnuwan7/azure-multi-env-cicd-pipeline

gh variable set AZURE_CLIENT_ID --repo "$REPO" --body "$APP_ID"
gh variable set AZURE_TENANT_ID --repo "$REPO" --body "$TENANT"
gh variable set AZURE_SUBSCRIPTION_ID --repo "$REPO" --body "$SUB"
gh variable set IDENTITY_ID --repo "$REPO" --body "$IDENTITY_ID"

gh variable get IDENTITY_ID --repo "$REPO"
```

**Check:** `gh variable list` shows four variables with no stray characters.

Then configure the GitHub environments (`dev`, `staging` with no reviewer, `production` with you as reviewer, all restricted to `main`) and the rulesets (required `test` and `bicep` checks on `main`, and protection for `prod-*` tags). These are settings, so they have no commands.

## 13. Review the workflows and run the first release

The release pipeline is `.github/workflows/ci-cd.yml`. Read it in the repo before the first run.

Make a small change on a branch and open a pull request:

```bash
git checkout -b feature/first-release
# edit src/index.html: uncomment or add a visible footer inside <body>
npm test
npm run lint
git add -A
git commit -m "Add footer to status page"
git push -u origin feature/first-release
```

Once `test` and `bicep` pass, merge it. Commit any workflow change with:

```bash
git add .github
git commit -m "Add manual rollback with dry run and release checks"
git push origin main
```

When the release finishes, check production's version:

```bash
PROD_FQDN=$(az containerapp show -g rg-nodeapp-prod -n nodeapp-prod \
  --query properties.configuration.ingress.fqdn -o tsv | tr -d '\r')
curl -s "https://$PROD_FQDN/api/status"
az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod -o table
git fetch --tags && git tag -l 'prod-*'
```

**Check:** the `version` field matches the merge commit, and a `prod-<sha7>` tag exists.

## 14. Test the rollback

Run **Roll back production** from the Actions tab with dry run checked, and read the plan in the run summary. Then run it without dry run, and approve it. Check the version went back:

```bash
curl -s "https://$PROD_FQDN/api/status"
az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod -o table
```

Finish with a normal change through the pipeline, so production rolls forward again.


## 15. Failure drill (optional)

The drill measures how long a bad version serves users, and how fast a rollback restores service. Run it only when you want measured numbers for the write-up.

```bash
export MSYS_NO_PATHCONV=1
DOMAIN=$(az containerapp env show -g rg-nodeapp-prod -n cae-nodeapp-prod \
  --query properties.defaultDomain -o tsv | tr -d '\r')
IMAGE=$(az containerapp show -g rg-nodeapp-prod -n nodeapp-prod \
  --query "properties.template.containers[0].image" -o tsv | tr -d '\r')

az containerapp update -g rg-nodeapp-prod -n nodeapp-prod \
  --image "$IMAGE" --revision-suffix drill001 \
  --set-env-vars APP_VERSION=drill001 FAIL_AFTER_SECONDS=90
az containerapp revision label add -g rg-nodeapp-prod -n nodeapp-prod \
  --label green --revision nodeapp-prod--drill001 --yes
```

```bash
START=$(date +%s)
az containerapp ingress traffic set -g rg-nodeapp-prod -n nodeapp-prod \
  --label-weight blue=0 green=100
PUBLIC=$(az containerapp show -g rg-nodeapp-prod -n nodeapp-prod \
  --query properties.configuration.ingress.fqdn -o tsv | tr -d '\r')
while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$PUBLIC/health")
  echo "$(( $(date +%s) - START ))s: $CODE"
  [ "$CODE" != "200" ] && break
  sleep 5
done
```

```bash
ROLLBACK_START=$(date +%s)
az containerapp ingress traffic set -g rg-nodeapp-prod -n nodeapp-prod \
  --label-weight blue=100 green=0
while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$PUBLIC/health")
  echo "$(( $(date +%s) - ROLLBACK_START ))s: $CODE"
  [ "$CODE" = "200" ] && break
  sleep 5
done
```

```bash
az containerapp revision deactivate -g rg-nodeapp-prod -n nodeapp-prod --revision nodeapp-prod--drill001
```

## 16. Clean up when idle

Delete the environment groups:

```bash
az group delete -n rg-nodeapp-dev --yes --no-wait
az group delete -n rg-nodeapp-staging --yes --no-wait
az group delete -n rg-nodeapp-prod --yes --no-wait
```

Keep `rg-nodeapp-shared` if you want to rebuild quickly. Delete everything:

```bash
az group delete -n rg-nodeapp-shared --yes --no-wait
az ad app delete --id "$APP_ID"
```

To rebuild later, repeat steps 6 to 10, then push a change to `main`.

---

## Appendix: command reference

```bash
export MSYS_NO_PATHCONV=1

# Live traffic split
az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod -o table

# All revisions and their state
az containerapp revision list -g rg-nodeapp-prod -n nodeapp-prod -o table

# Live revision name
az containerapp ingress traffic show -g rg-nodeapp-prod -n nodeapp-prod \
  --query "[?weight==\`100\`].revisionName | [0]" -o tsv | tr -d '\r'

# Image currently deployed to dev
az containerapp show -g rg-nodeapp-dev -n nodeapp-dev \
  --query "properties.template.containers[0].image" -o tsv | tr -d '\r'

# Production address
az containerapp show -g rg-nodeapp-prod -n nodeapp-prod \
  --query properties.configuration.ingress.fqdn -o tsv | tr -d '\r'

# Latest workflow runs
gh run list --repo dewnuwan7/azure-multi-env-cicd-pipeline --limit 5
```

## When something fails

- **`MissingSubscription` or a Windows path in an error:** run `export MSYS_NO_PATHCONV=1` in the current session.
- **`AADSTS700213` at login:** the federated subject doesn't match what GitHub sends. Compare it with the subject in the failed run's log.
- **The pull fails with an authorization error:** check the AcrPull assignment on `id-nodeapp-pull`, and wait a few minutes after creating it.
- **A deployment record returns 409:** the record step is missing `required_contexts: []`. Check that the current `ci-cd.yml` is on `main`.
- **`npm ci` fails:** `package.json` and `package-lock.json` are out of sync. Commit the lockfile with any dependency change.