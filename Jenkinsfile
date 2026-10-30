// Branch strategy:
//   develop -> build once -> deploy to DEV
//   main    -> build once -> deploy to STAGING -> manual approval -> deploy the SAME image to PRODUCTION
//
// Run this on a Jenkins node that has docker + ansible installed and SSH access to the
// dev/staging/prod VMs (e.g. your Ansible VM added as a Jenkins agent with the label "ansible").
//
// Jenkins credentials needed:
//   registry-creds        Username/password for the image registry (Docker Hub etc.)
//   ansible-vault-dev     Secret file: vault password for dev      (created by scripts/init-secrets.sh)
//   ansible-vault-staging Secret file: vault password for staging
//   ansible-vault-prod    Secret file: vault password for prod

def deployTo(String target) {
    withEnv(["TARGET=${target}"]) {
        withCredentials([
            file(credentialsId: "ansible-vault-${target}", variable: 'VAULT_FILE'),
            usernamePassword(credentialsId: 'registry-creds',
                             usernameVariable: 'REGISTRY_USER',
                             passwordVariable: 'REGISTRY_PASS')
        ]) {
            dir('ansible') {
                sh '''
                    ansible-galaxy collection install -r requirements.yml
                    ansible-playbook \
                      -i "inventories/$TARGET/hosts.yml" \
                      playbooks/deploy.yml \
                      --vault-password-file "$VAULT_FILE" \
                      -e "image_tag=$IMAGE_TAG"
                '''
            }
        }
    }
}

pipeline {
    agent { label 'ansible' }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    environment {
        IMAGE_REPO = 'zahidbilal/mysite'   // CHANGE ME (same value as image_repo in the inventories)
    }

    stages {
        stage('Test') {
            steps {
                script { env.IMAGE_TAG = sh(returnStdout: true, script: 'git rev-parse --short=8 HEAD').trim() }
                // The Dockerfile "test" stage runs npm test; the build fails if a test fails.
                sh 'docker build --target test -t "$IMAGE_REPO:test-$IMAGE_TAG" app'
            }
        }

        stage('Build & Push image') {
            when { anyOf { branch 'develop'; branch 'main' } }
            steps {
                withCredentials([usernamePassword(credentialsId: 'registry-creds',
                                                  usernameVariable: 'REGISTRY_USER',
                                                  passwordVariable: 'REGISTRY_PASS')]) {
                    sh '''
                        echo "$REGISTRY_PASS" | docker login -u "$REGISTRY_USER" --password-stdin
                        docker build --target runtime -t "$IMAGE_REPO:$IMAGE_TAG" app
                        docker push "$IMAGE_REPO:$IMAGE_TAG"
                    '''
                }
            }
        }

        stage('Deploy to DEV') {
            when { branch 'develop' }
            steps { script { deployTo('dev') } }
        }

        stage('Deploy to STAGING') {
            when { branch 'main' }
            steps { script { deployTo('staging') } }
        }

        stage('Approve production') {
            when { branch 'main' }
            steps {
                timeout(time: 1, unit: 'DAYS') {
                    input message: "Deploy ${env.IMAGE_TAG} to PRODUCTION?", ok: 'Deploy to prod'
                }
            }
        }

        stage('Deploy to PRODUCTION') {
            when { branch 'main' }
            steps { script { deployTo('prod') } }
        }
    }

    post {
        always { sh 'docker image rm -f "$IMAGE_REPO:test-$IMAGE_TAG" || true' }
        failure { echo "Deployment pipeline failed - check the stage above. Ansible rolls back automatically if the health check fails." }
    }
}
