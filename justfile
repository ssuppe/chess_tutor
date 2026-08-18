# file: justfile
# Independent deployment for Chess Tutor to suppeinthelife.com/chess

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
    ssh -t ssuppe@{{SERVER_IP}} "\
        echo '--- Loading Chess Image ---' && \
        ((pv app/deploy-artifacts/chess.tar.gz 2>/dev/null || cat app/deploy-artifacts/chess.tar.gz) | docker load) && \
        docker network create caddy-proxy 2>/dev/null || true && \
        docker stop chess-tutor 2>/dev/null || true && \
        docker rm chess-tutor 2>/dev/null || true && \
        docker run -d --name chess-tutor --restart unless-stopped --network caddy-proxy -e PORT=3050 -e NEXT_PUBLIC_BASE_PATH=/chess chess-tutor:latest && \
        echo '--- Cleaning up ---' && \
        rm -f app/deploy-artifacts/chess.tar.gz && \
        docker image prune -f"

