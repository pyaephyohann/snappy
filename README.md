# snappy

A simple private space for friends to share and discover snaps.

## Image upload and optimization

Snappy accepts JPEG, PNG, WebP, and GIF image selections up to 10 MB. New raster uploads are validated from their actual bytes, auto-oriented from EXIF data, resized proportionally to a maximum dimension of 4096 pixels, and encoded as WebP at quality 82 before Cloudinary receives them. Animated GIFs are treated as static image uploads and are converted to WebP.

Browser Snap and Telegram Mini App uploads use the authenticated `/api/cloudinary/optimize` bridge before continuing through Snappy's existing signed Cloudinary upload flow. Telegram bot photos are optimized by the same shared server utility before the server-side Cloudinary upload. Cloudinary continues to use the `snappy/snaps` folder and existing database URL/public ID behavior.

Profile photo changes and Admin/Hero Carousel profile/image selection reuse existing Snap URLs; they do not upload new raster bytes and therefore do not invoke the optimizer. Existing Cloudinary images are not migrated and remain supported.

The shared implementation is in `lib/image-optimization.ts`; the server bridge is `app/api/cloudinary/optimize/route.ts`. PDFs and other non-image files are not sent through this pipeline.

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

## Telegram bot

Optional Telegram integration lives in `lib/telegram` and receives updates at `/api/telegram/webhook`. Setup, environment variables, and current command coverage are in [docs/telegram.md](docs/telegram.md).
