import { NigeriaBulkSMSClient } from 'nigeriabulksms-sdk';

// Initialize the client
const client = new NigeriaBulkSMSClient({
    username: process.env.NGBULKSMS_ID, //'godstreasurer@gmail.com',
    password: process.env.NGBULKSMS_SECRET, //'Godstreasury.com20$'
});

// Send an SMS
export async function sendSMSNG(to, msg) {
    try {
        const response = await client.sms.send({
            message: msg,
            sender: 'WELLINNOVATE',
            mobiles: to
        });
        console.log('SMS sent successfully:', response);

    } catch (error) {
        console.error('Error sending SMS:', error.message);
    }
}
