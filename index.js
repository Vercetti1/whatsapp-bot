console.log('Starting bot...');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mime = require('mime-types');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

client.on('qr', (qr) => {
    console.log('Scan this QR code with WhatsApp to log in:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message_create', async msg => {
    if (msg.from === 'status@broadcast') return;

    const chat = await msg.getChat();

    if (msg.body === '!tagall' || msg.body === '@all') {
        if (chat.isGroup) {
            let text = '*Everyone in this group:*\n\n';
            let mentions = [];

            for (let participant of chat.participants) {
                mentions.push(participant.id._serialized);
                text += `${mentions.length}. @${participant.id.user}\n`;
            }

            await chat.sendMessage(text, { mentions });
        } else {
            msg.reply('This command can only be used in a group!');
        }
    }

    if (msg.hasMedia && msg.type !== 'sticker' && msg.isViewOnce) {
        console.log('View Once message received!');
        try {
            const media = await msg.downloadMedia();
            if (media) {
                await client.sendMessage(msg.from, media, { caption: 'Here is the view once image you sent.' });
                console.log('View Once media saved/resent.');
            }
        } catch (error) {
            console.error('Error downloading view once media:', error);
        }
    }

    if (msg.body === '!help') {
        const helpText = `
*WhatsApp Bot Commands*
-------------------------
*!tagall* or *@all*: Tag everyone in the group.
*!tag <name>*: Tag specific people (e.g., !tag david).
*!admins*: Tag all group admins.
*!sticker*: Reply to an image to turn it into a sticker.
*View Once Saver*: Send a view once image, and I will send it back to you.
*Deleted Messages*: I automatically save deleted messages to your "Note to Self".
*!help*: Show this help message.
        `;
        msg.reply(helpText);
    }

    if (msg.body === '!sticker') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia) {
                try {
                    const media = await quotedMsg.downloadMedia();
                    await chat.sendMessage(media, { 
                        sendMediaAsSticker: true,
                        stickerName: 'Stickers😼',
                        stickerAuthor: 'Vercetti✒️'
                    });
                } catch (error) {
                    console.error('Error creating sticker:', error);
                    msg.reply('Error creating sticker.');
                }
            } else {
                msg.reply('Reply to an image/video to create a sticker!');
            }
        } else {
            msg.reply('Reply to an image/video to create a sticker!');
        }
    }

    if (msg.body.startsWith('!tag ')) {
        if (chat.isGroup) {
            const searchName = msg.body.slice(5).toLowerCase().trim();
            let text = `*Matches for "${searchName}":*\n\n`;
            let mentions = [];
            let count = 0;

            for (let participant of chat.participants) {
                try {
                    const contact = await client.getContactById(participant.id._serialized);
                    const name = contact.name || contact.pushname || contact.number;
                    
                    if (name && name.toLowerCase().includes(searchName)) {
                        mentions.push(participant.id._serialized);
                        count++;
                        text += `${count}. @${participant.id.user}\n`;
                    }
                } catch (e) {
                    console.log('Error fetching contact for tag search:', e.message);
                }
            }

            if (mentions.length > 0) {
                await chat.sendMessage(text, { mentions });
            } else {
                msg.reply(`No one found with name "${searchName}".`);
            }
        } else {
            msg.reply('This command can only be used in a group!');
        }
    }

    if (msg.body === '!admins') {
        if (chat.isGroup) {
            let text = '*Admins:*\n\n';
            let mentions = [];
            let count = 0;

            for (let participant of chat.participants) {
                if (participant.isAdmin || participant.isSuperAdmin) {
                     mentions.push(participant.id._serialized);
                     count++;
                     text += `${count}. @${participant.id.user}\n`;
                }
            }

            await chat.sendMessage(text, { mentions });
        } else {
            msg.reply('This command can only be used in a group!');
        }
    }
});

client.on('message_revoke_everyone', async (after, before) => {
    if (before) {
        const user = before.author || before.from;
        let contactName = user;
        try {
            const contact = await client.getContactById(user);
            contactName = contact.name || contact.pushname || user;
        } catch (err) {
            console.log('Error getting contact for revoked message:', err.message);
        }
        
        let text = `*Deleted Message Detected!*\nFrom: ${contactName}\n`;
        
        if (before.body) {
            text += `Content: ${before.body}`;
        }
        
        if (client.info && client.info.wid) {
            await client.sendMessage(client.info.wid._serialized, text);
            
            if (before.hasMedia) {
                 try {
                    const media = await before.downloadMedia();
                    if (media) {
                        await client.sendMessage(client.info.wid._serialized, media, { caption: 'Deleted Media' });
                    }
                } catch (e) {
                    console.log('Could not download deleted media');
                }
            }
        }
    }
});

console.log('Initializing client...');
client.initialize();

