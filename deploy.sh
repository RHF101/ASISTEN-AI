#!/bin/bash

DOWNLOAD_FOLDER="/sdcard/Download/rhf-super-ai"
TARGET_DIR="$HOME/ASISTEN-AI"

echo "=========================================="
echo "1. Menyalin folder dari Download..."
echo "=========================================="
if [ -d "$DOWNLOAD_FOLDER" ]; then
    mkdir -p "$TARGET_DIR"
    cp -rf "$DOWNLOAD_FOLDER"/* "$TARGET_DIR"/
    echo "> Berhasil menyalin file ke $TARGET_DIR"
else
    echo "> Error: Folder '$DOWNLOAD_FOLDER' tidak ditemukan di Download!"
    exit 1
fi

echo ""
echo "=========================================="
echo "2. Sinkronisasi ke GitHub..."
echo "=========================================="
cd "$TARGET_DIR" || exit
git add .
git commit -m "Update otomatis dari Termux - $(date +'%Y-%m-%d %H:%M:%S')"
git push origin main

echo ""
echo "=========================================="
echo "3. Deployment ke Vercel..."
echo "=========================================="
if ! command -v vercel &> /dev/null; then
    npm install -g vercel
fi
vercel --prod

echo ""
echo "=========================================="
echo " Selesai! Semua proses berhasil."
echo "=========================================="
