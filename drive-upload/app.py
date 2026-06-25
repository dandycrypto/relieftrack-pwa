"""
Flask endpoint for uploading receipt images to Google Drive.
Uses the inbox-triage token to authenticate with Google Drive.
Upload folder: 1ZRdU1qLjuiQ5RvIIOpFJijcx_3vdKT3o
"""

import os
import re
import datetime
import json
from pathlib import Path
from flask import Flask, request, jsonify
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

app = Flask(__name__)

TOKEN_FILE = Path.home() / ".config" / "inbox-triage" / "token.json"
DRIVE_FOLDER_ID = "1ZRdU1qLjuiQ5RvIIOpFJijcx_3vdKT3o"
SPREADSHEET_ID = "1vmX8bh35oDiFJ2Url6B9p48MT5xBN7HXYU6LNgUeaT4"

def get_creds():
    """Refresh and return Drive credentials."""
    token_data = json.load(open(TOKEN_FILE))
    creds = Credentials(
        token=None,
        refresh_token=token_data["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"]
    )
    creds.refresh(Request())
    return creds

def get_or_create_folder(drive, name, parent_id, mimeType="application/vnd.google-apps.folder"):
    """Get or create a folder by name under parent."""
    result = drive.files().list(
        q=f"name='{name}' and mimeType='{mimeType}' and '{parent_id}' in parents and trashed=false",
        fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True
    ).execute()
    if result.get("files"):
        return result["files"][0]["id"]
    folder = drive.files().create(
        body={"name": name, "mimeType": mimeType, "parents": [parent_id]},
        fields="id", supportsAllDrives=True
    ).execute()
    return folder["id"]

def upload_file(drive, file_data: str, filename: str, year: str, month: str):
    """Upload a base64-encoded image to Drive, organized by year/month folders."""
    import base64, io
    from PIL import Image

    # Decode base64
    if "," in file_data:
        file_data = file_data.split(",", 1)[1]
    img_data = base64.b64decode(file_data)

    # Save to temp file
    tmp_path = f"/tmp/{filename}"
    Image.open(io.BytesIO(img_data)).save(tmp_path, "JPEG", quality=85)

    # Get/create year folder
    year_id = get_or_create_folder(drive, year, DRIVE_FOLDER_ID)
    # Get/create month folder
    try:
        month_name = datetime.datetime.strptime(month, "%m").strftime("%B")
    except:
        month_name = month
    month_id = get_or_create_folder(drive, f"{int(month):02d}_{month_name}", year_id)

    file_metadata = {"name": filename, "parents": [month_id]}
    media = MediaFileUpload(tmp_path, mimetype="image/jpeg", resumable=True)
    uploaded = drive.files().create(
        body=file_metadata, media_body=media, fields="id", supportsAllDrives=True
    ).execute()

    os.unlink(tmp_path)
    return f"https://drive.google.com/file/d/{uploaded['id']}/view?usp=drivesdk"

@app.route("/upload", methods=["POST"])
def upload():
    """Receive base64 image and upload to Google Drive.
    
    Body: { "image": "<base64>", "filename": "receipt.jpg", "date": "2026-04-26" }
    Returns: { "driveLink": "...", "filename": "..." }
    """
    data = request.get_json() or {}
    image_b64 = data.get("image", "")
    filename = data.get("filename", f"receipt_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg")
    date_str = data.get("date", datetime.date.today().strftime("%Y-%m-%d"))

    if not image_b64:
        return jsonify({"error": "No image data provided"}), 400

    year = date_str[:4]
    month = date_str[5:7] or datetime.date.today().strftime("%m")

    try:
        creds = get_creds()
        drive = build("drive", "v3", credentials=creds)
        link = upload_file(drive, image_b64, filename, year, month)
        return jsonify({"driveLink": link, "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
