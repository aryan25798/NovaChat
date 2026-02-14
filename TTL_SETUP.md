# Firestore TTL Setup Guide

To complete the cost optimization, you must manually enable the Time-to-Live (TTL) policy for the `messages` collection in your Firebase project.

## Steps

1.  **Open Google Cloud Console** or **Firebase Console**.
2.  Navigate to **Firestore Database** > **Data**.
3.  Click on the **TTL (Time to Live)** tab (or "Policies" in some views).
4.  Click **Create Policy**.
5.  Enter the following details:
    -   **Collection group**: `messages`
    -   **Timestamp field**: `expireAt`
6.  Click **Create**.

## What this does
Firestore will automatically delete any document in the `messages` collection where the `expireAt` timestamp has passed. We have updated the app to set this field only when a message is "deleted for everyone", ensuring that soft-deleted message placeholders are cleaned up after **30 days**.

> **Note**: It may take up to 24 hours for the first cleanup to run after creating the policy.

## Troubleshooting
**Can't find `expireAt` in the dropdown?**
Since `expireAt` is a new field we just added to the code, Firestore doesn't see it in your existing data yet.
**Simply type `expireAt` manually** into the "Timestamp field" box and click Create. You do not need to select it from the list.
