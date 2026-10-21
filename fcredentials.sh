REPO="dewnuwan7/azure-multi-env-cicd-pipeline"
APP_ID="c59a4154-9bd5-46b6-986d-21ce5866148c"

for SUBJECT in \
  "repo:$REPO:ref:refs/heads/main" \
  "repo:$REPO:environment:dev" \
  "repo:$REPO:environment:staging" \
  "repo:$REPO:environment:production"; do
  NAME=$(echo "$SUBJECT" | tr -c 'a-zA-Z0-9' '-' | cut -c1-120)
  az ad app federated-credential create --id $APP_ID --parameters "{
    \"name\": \"$NAME\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$SUBJECT\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
done

az ad app federated-credential list --id $APP_ID -o table
