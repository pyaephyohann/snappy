# snappy

A simple private space for friends to share and discover snaps.

## Snap creation

Snaps are created from a friend profile page. You can:

- **Choose Photo** — pick an image from your device or drag and drop into the uploader (existing flow).
- **Take Photo** — capture with the device camera when the browser supports `getUserMedia` (secure context required).

Camera captures are converted to a JPEG `File` and passed through the same preview, validation, Cloudinary upload, and `/api/snaps` creation pipeline as gallery images.

### Camera limitations

- Requires HTTPS (or localhost) and user permission.
- Some browsers or installed PWAs may restrict camera switching or deny permission; gallery upload remains available as fallback.
- Camera streams are stopped when you leave camera mode or close the uploader.

## Admin user profile photos

From **Admin → Users → Edit user**, admins can choose **Choose from user's images** to set a profile photo from that user's existing Snaps.

- The server verifies the selected Snap belongs to the target user.
- Snappy reuses the Snap's existing Cloudinary `imageUrl` on `User.profileImage`.
- No new Cloudinary upload is performed for profile photo changes.
