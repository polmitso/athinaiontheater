# ===================================================
# STAGE 1: Αυτόματη βελτιστοποίηση Media (Images & Videos)
# ===================================================
FROM alpine:3.19 AS optimizer
RUN apk add --no-cache imagemagick ffmpeg findutils

WORKDIR /src
COPY . .

# 1. Βελτιστοποίηση εικόνων (αν υπάρχει φάκελος images)
RUN if [ -d "images" ]; then \
      find images/ -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) -exec \
      magick "{}" -resize "1920x1920>" -strip -quality 82 "{}" \; ; \
    fi

# 2. Βελτιστοποίηση MP4 βίντεο για άμεσο web streaming (faststart flag)
RUN if [ -d "videos" ]; then \
      for v in videos/*.mp4; do \
        [ -f "$v" ] || continue; \
        ffmpeg -y -i "$v" -c:v libx264 -crf 26 -preset faster -an -movflags +faststart "videos/opt_$(basename "$v")" 2>/dev/null && \
        mv "videos/opt_$(basename "$v")" "$v" || true; \
      done; \
    fi

# ===================================================
# STAGE 2: Nginx Production Server με Video Streaming
# ===================================================
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip Compression για κείμενο & κώδικα
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Ρυθμίσεις για Streaming Video (MP4 / WebM)
    location ~* \.(mp4|webm)$ {
        mp4;
        mp4_buffer_size 1m;
        mp4_max_buffer_size 5m;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        add_header Accept-Ranges bytes;
    }

    # Browser Caching για Εικόνες & Fonts
    location ~* \.(jpg|jpeg|png|gif|ico|webp|svg|woff|woff2|ttf|css|js)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Fallback Routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
EOF

# Αντιγραφή όλων των βελτιστοποιημένων αρχείων στο Nginx
COPY --from=optimizer /src /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
