const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 👇👇 تعديل الأرقام هنا 👇👇
const CONFIG = {
    CATEGORY_ID: '1546827284873478185',
    STAFF_ROLE_ID: '1559602835715268719',
    LOG_CHANNEL_ID: '1559602463290560654'
};

client.once('ready', () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
});

// ========== أمر إنشاء لوحة التذاكر + أوامر التذكرة ==========
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // أمر !setup
    if (message.content === '!setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🎫 نظام التذاكر والدعم الفني')
            .setDescription('إذا كان لديك أي إستفسار أو مشكلة، اضغط على الزر الأسفل لفتح تذكرة والتحدث مع الإدارة.')
            .setColor('#5865F2');

        const button = new ButtonBuilder()
            .setCustomId('open_ticket')
            .setLabel('فتح تذكرة')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩');

        const row = new ActionRowBuilder().addComponents(button);
        await message.channel.send({ embeds: [embed], components: [row] });
        return;
    }

    // ========== أوامر داخل التذكرة فقط ==========
    if (!message.channel.name.startsWith('ticket-') && !message.channel.name.startsWith('🔒')) return;

    const isStaff = message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    // !add @عضو
    if (message.content.startsWith('!add ')) {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ منشن العضو اللي تبي تضيفه.\nمثال: `!add @اسم`');

        await message.channel.permissionOverwrites.edit(member.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
        });
        return message.reply(`✅ تم إضافة ${member} إلى التذكرة.`);
    }

    // !remove @عضو
    if (message.content.startsWith('!remove ')) {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ منشن العضو اللي تبي تشيله.\nمثال: `!remove @اسم`');

        await message.channel.permissionOverwrites.delete(member.id);
        return message.reply(`✅ تم إزالة ${member} من التذكرة.`);
    }

    // !rename الاسم-الجديد
    if (message.content.startsWith('!rename ')) {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const newName = message.content.slice(8).trim().toLowerCase().replace(/\s+/g, '-');
        if (!newName || newName.length < 2) return message.reply('❌ اكتب الاسم الجديد.\nمثال: `!rename مشكلة-الدفع`');

        const prefix = message.channel.name.startsWith('🔒') ? '🔒' : 'ticket-';
        await message.channel.setName(`${prefix}${newName}`);
        return message.reply(`✅ تم تغيير اسم التذكرة إلى: **${prefix}${newName}**`);
    }

    // !lock
    if (message.content === '!lock') {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        await lockTicket(message.channel, message.member, message);
        return;
    }

    // !unlock
    if (message.content === '!unlock') {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        await unlockTicket(message.channel, message);
        return;
    }

    // !staff
    if (message.content === '!staff') {
        return message.channel.send(`📢 <@&${CONFIG.STAFF_ROLE_ID}> تم استدعاؤكم إلى هذه التذكرة بواسطة ${message.author}`);
    }

    // !user (استدعاء صاحب التذكرة برسالة خاصة)
    if (message.content === '!user') {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');

        const ownerOverwrite = message.channel.permissionOverwrites.cache.find(ow => {
            return ow.type === 1 &&
                   ow.id !== message.guild.id &&
                   ow.allow.has(PermissionFlagsBits.ViewChannel);
        });

        if (!ownerOverwrite) {
            return message.reply('❌ ما قدرت ألقى صاحب التذكرة.');
        }

        try {
            const owner = await message.guild.members.fetch(ownerOverwrite.id);
            await owner.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📢 تم استدعاؤك')
                        .setDescription(`تم استدعاؤك إلى تذكرتك في سيرفر **${message.guild.name}**\n\nالروم: ${message.channel}\nبواسطة: ${message.author}`)
                        .setColor('#5865F2')
                        .setTimestamp()
                ]
            });
            return message.reply(`✅ تم إرسال رسالة خاصة إلى <@${ownerOverwrite.id}>`);
        } catch (err) {
            return message.reply(`❌ ما قدرت أرسل رسالة خاصة للعضو (غالباً مسكر الخاص).`);
        }
    }
});

// ========== دوال القفل والفتح ==========
async function lockTicket(channel, member, interactionOrMessage) {
    // منع الكتابة عن كل الأعضاء المضافين
    const overwrites = channel.permissionOverwrites.cache;
    for (const [id, overwrite] of overwrites) {
        if (overwrite.type === 1) { // عضو
            await channel.permissionOverwrites.edit(id, {
                SendMessages: false
            });
        }
    }

    // الإدارة تقدر تكتب
    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
    });

    // تغيير الاسم
    if (!channel.name.startsWith('🔒')) {
        await channel.setName(`🔒${channel.name}`);
    }

    const embed = new EmbedBuilder()
        .setTitle('🔒 تم قفل التذكرة')
        .setDescription(`تم قفل التذكرة **${channel.name}**\nبواسطة: ${member}\n\nيمكنك فتحها مرة ثانية أو حذفها نهائياً.`)
        .setColor('#FFA500')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('unlock_ticket')
            .setLabel('فتح التذكرة')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔓'),
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('حذف التذكرة')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );

    if (interactionOrMessage.reply) {
        // من أمر نصي
        await interactionOrMessage.reply({ embeds: [embed], components: [row] });
    } else {
        // من زر
        await interactionOrMessage.reply({ embeds: [embed], components: [row] });
    }
}

async function unlockTicket(channel, interactionOrMessage) {
    // السماح بالكتابة مرة ثانية لكل الأعضاء المضافين
    const overwrites = channel.permissionOverwrites.cache;
    for (const [id, overwrite] of overwrites) {
        if (overwrite.type === 1) { // عضو
            await channel.permissionOverwrites.edit(id, {
                SendMessages: true
            });
        }
    }

    // إزالة 🔒 من الاسم
    if (channel.name.startsWith('🔒')) {
        await channel.setName(channel.name.replace('🔒', ''));
    }

    const content = '🔓 تم **فتح** التذكرة مرة ثانية. الجميع يقدر يكتب الآن.';

    if (interactionOrMessage.reply) {
        await interactionOrMessage.reply({ content });
    } else {
        await interactionOrMessage.reply({ content });
    }
}

// ========== التعامل مع الأزرار والـ Modal ==========
client.on('interactionCreate', async (interaction) => {

    // ----- فتح تذكرة -----
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

        const existing = interaction.guild.channels.cache.find(c =>
            c.name === `ticket-${interaction.user.username.toLowerCase()}` ||
            c.name === `🔒ticket-${interaction.user.username.toLowerCase()}`
        );
        if (existing) {
            return interaction.editReply({ content: `❌ عندك تذكرة مفتوحة بالفعل: ${existing}` });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CONFIG.CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎫 تذكرة ${interaction.user.username}`)
            .setDescription('مرحباً بك! اكتب مشكلتك هنا وسيقوم فريق الدعم بالرد عليك في أقرب وقت.\n\n**الأزرار المتاحة:**')
            .setColor('#248046')
            .setFooter({ text: `صاحب التذكرة: ${interaction.user.tag}` });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('add_member')
                .setLabel('إضافة عضو')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('call_staff')
                .setLabel('استدعاء الإدارة')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢'),
            new ButtonBuilder()
                .setCustomId('call_user')
                .setLabel('استدعاء العضو')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rename_ticket')
                .setLabel('تغيير الاسم')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId('lock_ticket')
                .setLabel('قفل التذكرة')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔒'),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('إغلاق التذكرة')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        await ticketChannel.send({
            content: `${interaction.user} | <@&${CONFIG.STAFF_ROLE_ID}>`,
            embeds: [embed],
            components: [row1, row2]
        });

        await interaction.editReply({ content: `✅ تم فتح تذكرتك بنجاح: ${ticketChannel}` });
        return;
    }

    // ----- زر إضافة عضو -----
    if (interaction.isButton() && interaction.customId === 'add_member') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });

        return interaction.reply({
            content: '➕ **لإضافة عضو** استخدم الأمر:\n```!add @العضو```',
            ephemeral: true
        });
    }

    // ----- زر استدعاء الإدارة -----
    if (interaction.isButton() && interaction.customId === 'call_staff') {
        await interaction.reply({
            content: `📢 <@&${CONFIG.STAFF_ROLE_ID}> تم استدعاؤكم إلى هذه التذكرة بواسطة ${interaction.user}`
        });
        return;
    }

    // ----- زر استدعاء العضو (يرسل رسالة خاصة) -----
    if (interaction.isButton() && interaction.customId === 'call_user') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });

        const ownerOverwrite = interaction.channel.permissionOverwrites.cache.find(ow => {
            return ow.type === 1 &&
                   ow.id !== interaction.guild.id &&
                   ow.allow.has(PermissionFlagsBits.ViewChannel);
        });

        if (!ownerOverwrite) {
            return interaction.reply({ content: '❌ ما قدرت ألقى صاحب التذكرة.', ephemeral: true });
        }

        try {
            const owner = await interaction.guild.members.fetch(ownerOverwrite.id);
            await owner.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📢 تم استدعاؤك')
                        .setDescription(`تم استدعاؤك إلى تذكرتك في سيرفر **${interaction.guild.name}**\n\nالروم: ${interaction.channel}\nبواسطة: ${interaction.user}`)
                        .setColor('#5865F2')
                        .setTimestamp()
                ]
            });
            await interaction.reply({ content: `✅ تم إرسال رسالة خاصة إلى <@${ownerOverwrite.id}>` });
        } catch (err) {
            await interaction.reply({ content: '❌ ما قدرت أرسل رسالة خاصة للعضو (غالباً مسكر الخاص).', ephemeral: true });
        }
        return;
    }

    // ----- زر تغيير الاسم (يفتح Modal) -----
    if (interaction.isButton() && interaction.customId === 'rename_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('rename_modal')
            .setTitle('تغيير اسم التذكرة');

        const nameInput = new TextInputBuilder()
            .setCustomId('new_ticket_name')
            .setLabel('الاسم الجديد (بدون مسافات)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('مثال: مشكلة-الدفع')
            .setRequired(true)
            .setMaxLength(50);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        await interaction.showModal(modal);
        return;
    }

    // ----- استقبال الـ Modal لتغيير الاسم -----
    if (interaction.isModalSubmit() && interaction.customId === 'rename_modal') {
        const newName = interaction.fields.getTextInputValue('new_ticket_name')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-');

        const prefix = interaction.channel.name.startsWith('🔒') ? '🔒' : 'ticket-';
        await interaction.channel.setName(`${prefix}${newName}`);
        await interaction.reply({ content: `✅ تم تغيير اسم التذكرة إلى: **${prefix}${newName}**` });
        return;
    }

    // ----- زر قفل التذكرة -----
    if (interaction.isButton() && interaction.customId === 'lock_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });

        await lockTicket(interaction.channel, interaction.member, interaction);
        return;
    }

    // ----- زر فتح التذكرة -----
    if (interaction.isButton() && interaction.customId === 'unlock_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ هذا الزر للإدارة فقط.', ephemeral: true });

        await unlockTicket(interaction.channel, interaction);
        return;
    }

    // ----- زر إغلاق / حذف التذكرة -----
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply({ content: '🗑️ سيتم حذف التذكرة نهائياً بعد **5 ثوانٍ**...' });

        const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ تذكرة محذوفة')
                .setDescription(`تم حذف الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                .setColor('#DA373C')
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (err) {
                console.log('خطأ في حذف الروم:', err);
            }
        }, 5000);
        return;
    }
});

client.login(process.env.TOKEN);