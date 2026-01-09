#!/bin/bash
# Deployment script for Google Cloud Run
# Usage: ./deploy-to-cloud-run.sh [PROJECT_ID]

set -e

# Get project ID from argument, environment, or gcloud config
PROJECT_ID="${1:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

if [ -z "$PROJECT_ID" ]; then
    echo "❌ No project ID specified."
    echo ""
    echo "Usage: ./deploy-to-cloud-run.sh PROJECT_ID"
    echo "   or: export GCP_PROJECT_ID=your-project-id && ./deploy-to-cloud-run.sh"
    echo "   or: gcloud config set project your-project-id && ./deploy-to-cloud-run.sh"
    exit 1
fi

SERVICE_NAME="claude-relay"
REGION="${GCP_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Claude Relay Server to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Not authenticated with gcloud. Run:"
    echo "gcloud auth login"
    exit 1
fi

# Set the project
echo "📦 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com --quiet
gcloud services enable run.googleapis.com --quiet
gcloud services enable containerregistry.googleapis.com --quiet

# Build the container image
echo "🏗️  Building container image..."
gcloud builds submit --tag $IMAGE_NAME

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --max-instances 10 \
  --min-instances 0 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --port 8080 \
  --session-affinity \
  --set-env-vars="DB_PATH=/app/data/sessions.db,NODE_ENV=production"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format='value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Service URL: $SERVICE_URL"
echo "🔌 WebSocket URL: ${SERVICE_URL/https/wss}"
echo "💚 Health check: $SERVICE_URL/health"
echo ""
echo "To use with your clients, set:"
echo "export SERVER_URL=${SERVICE_URL/https/wss}"
echo ""
echo "Then run:"
echo "ANTHROPIC_API_KEY=sk-... npm run client -- YourName SESSION123"
