# file: justfile
# Independent deployment for Chess Tutor to goodnumbers.net/chess

SERVER_IP := "34.46.45.86"
ARTIFACT_DIR := "./deploy-artifacts"
GEMINI_KEY := `grep NEXT_PUBLIC_GEMINI_API_KEY .env 2>/dev/null | cut -d= -f2 || echo ""`

# Build the production image with the correct subpath
build:
    @echo "Building Chess Tutor Docker image with basePath=/chess..."
    docker build \
        --build-arg NEXT_PUBLIC_BASE_PATH=/chess \
        --build-arg NEXT_PUBLIC_GEMINI_API_KEY="{{GEMINI_KEY}}" \
        -t chess-tutor:latest .

# Package the image for transport
package:
    @echo "Packaging Chess Tutor..."
    @mkdir -p {{ARTIFACT_DIR}}
    docker save chess-tutor:latest | gzip --rsyncable > {{ARTIFACT_DIR}}/chess.tar.gz

# Push the artifact to the server
push:
    @echo "Pushing Chess Tutor artifact to {{SERVER_IP}}..."
    ssh ssuppe@{{SERVER_IP}} "mkdir -p /home/ssuppe/app/deploy-artifacts"
    rsync -avzhP {{ARTIFACT_DIR}}/chess.tar.gz ssuppe@{{SERVER_IP}}:/home/ssuppe/app/deploy-artifacts/

# Deploy on the server (load image and restart service)
deploy: build package push
    @echo "Finalizing Chess Tutor deployment on the VM..."
    ssh -t ssuppe@{{SERVER_IP}} "cd app && \
        echo '--- Loading Chess Image ---' && \
        ((pv deploy-artifacts/chess.tar.gz 2>/dev/null || cat deploy-artifacts/chess.tar.gz) | docker load) && \
        echo '--- Restarting Chess Service ---' && \
        docker compose up -d chess && \
        echo '--- Cleaning up ---' && \
        rm deploy-artifacts/chess.tar.gz && \
        docker image prune -f"
