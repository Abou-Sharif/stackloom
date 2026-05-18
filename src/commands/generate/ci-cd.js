#!/usr/bin/env node

/**
 * CI/CD Pipeline Generators
 */

export function generateGitHubActions() {
  return `name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  NODE_VERSION: '20'
  MONGO_VERSION: '6.0'

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:${MONGO_VERSION}
        ports:
          - 27017:27017
        options: >-
          --health-cmd "echo 'db.runCommand(\"ping\").ok' | mongosh localhost:27017/test --quiet"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    strategy:
      matrix:
        node-version: [${'$'}{{ env.NODE_VERSION }}]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${'$'}{{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${'$'}{{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci

      - name: Run backend tests
        run: cd backend && npm test
        env:
          MONGODB_URI: mongodb://localhost:27017/test
          NODE_ENV: test

      - name: Run frontend tests
        run: cd frontend && npm test -- --watchAll=false
        env:
          CI: true

      - name: Run lint
        run: |
          cd backend && npm run lint
          cd frontend && npm run lint

      - name: Build frontend
        run: cd frontend && npm run build

  security:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level=moderate

      - name: Run SAST
        uses: shiftleft/scan-action@v2
        with:
          output: reports/

      - name: Upload security reports
        uses: actions/upload-artifact@v4
        with:
          name: security-reports
          path: reports/

  build:
    runs-on: ubuntu-latest
    needs: [test, security]
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${'$'}{{ secrets.DOCKERHUB_USERNAME }}
          password: ${'$'}{{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${'$'}{{ secrets.DOCKERHUB_USERNAME }}/app-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${'$'}{{ secrets.DOCKERHUB_USERNAME }}/app-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${'$'}{{ secrets.SSH_HOST }}
          username: ${'$'}{{ secrets.SSH_USER }}
          key: ${'$'}{{ secrets.SSH_KEY }}
          script: |
            cd /opt/app
            docker-compose pull
            docker-compose up -d
            docker system prune -f
`;
}

export function generateGitLabCI() {
  return `stages:
  - test
  - security
  - build
  - deploy

variables:
  NODE_VERSION: "20"
  MONGO_VERSION: "6.0"
  DOCKER_DRIVER: overlay2

services:
  - mongo:${MONGO_VERSION}

test:backend:
  stage: test
  image: node:${NODE_VERSION}
  before_script:
    - npm ci
    - npm run test:ci
  script:
    - npm run test
  artifacts:
    reports:
      junit: junit.xml
    when: always

test:frontend:
  stage: test
  image: node:${NODE_VERSION}
  before_script:
    - cd frontend
    - npm ci
  script:
    - npm run test:ci
  artifacts:
    reports:
      junit: junit.xml
    when: always

lint:
  stage: test
  image: node:${NODE_VERSION}
  script:
    - npm run lint
  allow_failure: true

sast:
  stage: security
  image: shiftleft/scan
  script:
    - scan --type --src . --out reports/
  artifacts:
    paths:
      - reports/

dependency_scan:
  stage: security
  image: node:${NODE_VERSION}
  script:
    - npm audit --audit-level=moderate
  allow_failure: true

build:frontend:
  stage: build
  image: node:${NODE_VERSION}
  script:
    - cd frontend
    - npm ci
    - npm run build
  artifacts:
    paths:
      - frontend/dist/
    expire_in: 1 week

docker:build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t \$CI_REGISTRY_IMAGE/backend:\$CI_COMMIT_SHA ./backend
    - docker build -t \$CI_REGISTRY_IMAGE/frontend:\$CI_COMMIT_SHA ./frontend
    - docker push \$CI_REGISTRY_IMAGE/backend:\$CI_COMMIT_SHA
    - docker push \$CI_REGISTRY_IMAGE/frontend:\$CI_COMMIT_SHA
  only:
    - main

deploy:production:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval \$(ssh-agent -s)
    - echo "\$SSH_PRIVATE_KEY" | tr -d '\\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
  script:
    - ssh -o StrictHostKeyChecking=no \$SSH_USER@\$SSH_HOST "cd /opt/app && docker-compose pull && docker-compose up -d"
  only:
    - main
`;
}

export function generateJenkinsfile() {
  return `pipeline {
    agent any

    environment {
        NODE_VERSION = '20'
        MONGO_VERSION = '6.0'
        DOCKER_REGISTRY = credentials('docker-registry')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup') {
            steps {
                sh '''
                    nvm install \${NODE_VERSION}
                    nvm use \${NODE_VERSION}
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh '''
                    cd backend && npm ci
                    cd ../frontend && npm ci
                '''
            }
        }

        stage('Test') {
            parallel {
                stage('Backend Tests') {
                    steps {
                        sh '''
                            docker run -d --name mongo -p 27017:27017 mongo:\${MONGO_VERSION}
                            sleep 5
                            cd backend && MONGODB_URI=mongodb://localhost:27017/test npm test
                            docker stop mongo && docker rm mongo
                        '''
                    }
                    post {
                        always {
                            junit 'backend/test-results/*.xml'
                        }
                    }
                }

                stage('Frontend Tests') {
                    steps {
                        sh '''
                            cd frontend && CI=true npm test -- --watchAll=false
                        '''
                    }
                    post {
                        always {
                            junit 'frontend/test-results/*.xml'
                        }
                    }
                }
            }
        }

        stage('Security Scan') {
            steps {
                sh 'npm audit --audit-level=moderate'
            }
        }

        stage('Build') {
            steps {
                sh '''
                    cd frontend && npm run build
                '''
                archiveArtifacts artifacts: 'frontend/build/**/*', fingerprint: true
            }
        }

        stage('Docker Build') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                    docker build -t \${DOCKER_REGISTRY_USR}/app:latest .
                    docker push \${DOCKER_REGISTRY_USR}/app:latest
                '''
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sshagent(['production-server']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no user@production-server \
                            "cd /opt/app && docker-compose pull && docker-compose up -d"
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            slackSend color: 'good', message: 'Pipeline succeeded!'
        }
        failure {
            slackSend color: 'danger', message: 'Pipeline failed!'
        }
    }
}
`;
}
