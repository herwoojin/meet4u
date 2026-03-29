import admin from 'firebase-admin';

// Initialize Firebase Admin (singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { type, title, body, recipientEmails, senderEmail } = JSON.parse(event.body);

        if (!type || !title || !body || !recipientEmails?.length) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        // Look up FCM tokens for all recipients (exclude sender)
        const tokens = [];
        const invalidTokenUsers = [];

        const emails = recipientEmails
            .filter(e => e && e !== senderEmail)
            .map(e => e.toLowerCase());

        if (emails.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent: 0 }) };
        }

        // Firestore 'in' query limit is 10, chunk if needed
        const chunks = [];
        for (let i = 0; i < emails.length; i += 10) {
            chunks.push(emails.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const snapshot = await db.collection('users')
                .where('email', 'in', chunk)
                .get();

            snapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    userData.fcmTokens.forEach(token => {
                        if (token) tokens.push({ token, userId: doc.id });
                    });
                }
            });
        }

        if (tokens.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent: 0, reason: 'No FCM tokens found' }) };
        }

        // Send FCM messages
        const sendResults = await Promise.allSettled(
            tokens.map(({ token, userId }) =>
                admin.messaging().send({
                    token,
                    data: { type, title, body },
                    android: { priority: 'high' },
                    apns: {
                        headers: { 'apns-priority': '10' },
                        payload: {
                            aps: {
                                alert: { title, body },
                                sound: 'default',
                                'content-available': 1,
                            },
                        },
                    },
                    webpush: {
                        headers: { Urgency: 'high' },
                        notification: {
                            title,
                            body,
                            icon: '/pwa-192x192.png',
                            badge: '/pwa-192x192.png',
                        },
                    },
                }).catch(err => {
                    if (err.code === 'messaging/invalid-registration-token' ||
                        err.code === 'messaging/registration-token-not-registered') {
                        invalidTokenUsers.push({ userId, token });
                    }
                    throw err;
                })
            )
        );

        // Clean up invalid tokens
        for (const { userId, token } of invalidTokenUsers) {
            try {
                await db.collection('users').doc(userId).update({
                    fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
                });
            } catch (e) {
                console.error('Failed to remove invalid token:', e);
            }
        }

        const successCount = sendResults.filter(r => r.status === 'fulfilled').length;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, sent: successCount, total: tokens.length }),
        };
    } catch (error) {
        console.error('Send notification error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
