# Power Dime - Python ML Microservice

FastAPI-based microservice for machine learning and analytics capabilities.

## Features

- **ML Predictions**: Placeholder for ML model inference
- **Analytics**: Project analytics and metrics
- **FastAPI**: Modern, fast Python web framework
- **Docker**: Containerized for easy deployment

## Local Development

### Prerequisites

- Python 3.11+
- pip

### Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
```

The service will be available at http://localhost:8000

### API Documentation

FastAPI provides automatic API documentation:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Docker

```bash
# Build image
docker build -t powerdime-ml-service .

# Run container
docker run -p 8000:8000 powerdime-ml-service
```

## API Endpoints

- `GET /health` - Health check
- `GET /ml/` - Service information
- `POST /ml/predict` - ML prediction endpoint
- `GET /ml/analytics/{project_id}` - Project analytics

## Environment Variables

- `ENVIRONMENT` - Environment name (development, staging, production)
- `PORT` - Service port (default: 8000)

## TODO

- [ ] Implement actual ML models
- [ ] Add database connectivity (Supabase)
- [ ] Implement real analytics logic
- [ ] Add authentication/authorization
- [ ] Add comprehensive tests
- [ ] Add logging and monitoring
