import { NextRequest, NextResponse } from 'next/server';

// Dynamic import to avoid Cloudinary SDK loading during build
const CLOUDINARY_FOLDER = 'snappy/snaps';

export async function POST(request: NextRequest) {
  try {
    // Dynamically import cloudinary only at runtime
    const { v2: cloudinary } = await import('cloudinary');

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!apiSecret) {
      return NextResponse.json(
        { error: 'Cloudinary API secret not configured' },
        { status: 500 }
      );
    }

    if (!cloudName) {
      return NextResponse.json(
        { error: 'Cloudinary cloud name not configured' },
        { status: 500 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Cloudinary API key not configured' },
        { status: 500 }
      );
    }

    // Configure Cloudinary at runtime
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    const body = await request.json();
    const { timestamp } = body;

    if (!timestamp) {
      return NextResponse.json(
        { error: 'Missing required parameter: timestamp' },
        { status: 400 }
      );
    }

    // Build params to sign
    const paramsToSign: Record<string, string> = {
      timestamp: timestamp.toString(),
      folder: CLOUDINARY_FOLDER,
    };

    // Generate signature using Cloudinary SDK
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret
    );

    // Return signature and public configuration
    // Never return the API secret
    return NextResponse.json({
      signature,
      timestamp,
      cloud_name: cloudName,
      api_key: apiKey,
      folder: CLOUDINARY_FOLDER,
    });
  } catch (error) {
    console.error('Cloudinary signature generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate signature' },
      { status: 500 }
    );
  }
}
