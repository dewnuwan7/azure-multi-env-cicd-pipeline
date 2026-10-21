
APP_ID="c59a4154-9bd5-46b6-986d-21ce5866148c"
REPO_ID="dewnuwan7@72617382/azure-multi-env-cicd-pipeline@1426592292"

declare -A SUBJECTS=(
  ["gh-main"]="repo:${REPO_ID}:ref:refs/heads/main"
  ["gh-env-dev"]="repo:${REPO_ID}:environment:dev"
  ["gh-env-staging"]="repo:${REPO_ID}:environment:staging"
  ["gh-env-prod"]="repo:${REPO_ID}:environment:production"
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