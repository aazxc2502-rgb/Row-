const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

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

const TICKET_TYPES = {
    inquiry: { label: 'استفسار', emoji: '❓', color: '#5865F2', prefix: 'استفسار' },
    complaint: { label: 'شكوى', emoji: '⚠️', color: '#ED4245', prefix: 'شكوى' },
    suggestion: { label: 'اقتراح', emoji: '💡', color: '#57F287', prefix: 'اقتراح' }
};

client.once('ready', () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
});

// ========== أمر !setup ==========
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        await message.delete().catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🎫 نظام التذاكر والدعم الفني')
            .setDescription('اختر نوع التذكرة المناسبة من الأزرار بالأسفل:\n\n❓ **استفسار** — لأي سؤال عام\n⚠️ **شكوى** — لتقديم شكوى\n💡 **اقتراح** — لتقديم اقتراح')
            .setColor('#5865F2')
            .setFooter({ text: 'اضغط على الزر المناسب لفتح تذكرة' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_inquiry')
                .setLabel('استفسار')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('❓'),
            new ButtonBuilder()
                .setCustomId('open_complaint')
                .setLabel('شكوى')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️'),
            new ButtonBuilder()
                .setCustomId('open_suggestion')
                .setLabel('اقتراح')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💡')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return;
    }

    // ========== أوامر داخل التذكرة ==========
    if (!isTicketChannel(message.channel)) return;

    const isStaff = message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                    message.member.permissions.has(PermissionFlagsBits.Administrator);

    // !add @عضو
    if (message.content.startsWith('!add ')) {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ منشن العضو.\nمثال: `!add @اسم`');

        const existing = message.channel.permissionOverwrites.cache.get(member.id);
        if (existing && existing.allow.has(PermissionFlagsBits.ViewChannel)) {
            return message.reply(`⚠️ **${member.user.username}** موجود في التذكرة أصلاً.`);
        }

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
        if (!member) return message.reply('❌ منشن العضو.\nمثال: `!remove @اسم`');

        const existing = message.channel.permissionOverwrites.cache.get(member.id);
        if (!existing || !existing.allow.has(PermissionFlagsBits.ViewChannel)) {
            return message.reply(`⚠️ **${member.user.username}** مو موجود في التذكرة.`);
        }

        await message.channel.permissionOverwrites.delete(member.id);
        return message.reply(`✅ تم إزالة ${member} من التذكرة.`);
    }

    // !rename
    if (message.content.startsWith('!rename ')) {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const newName = message.content.slice(8).trim().toLowerCase().replace(/\s+/g, '-');
        if (!newName || newName.length < 2) return message.reply('❌ اكتب الاسم الجديد.\nمثال: `!rename مشكلة-الدفع`');

        const isLocked = message.channel.name.startsWith('🔒');
        const typePrefix = getTypePrefix(message.channel.name);
        const finalName = isLocked ? `🔒${typePrefix}-${newName}` : `${typePrefix}-${newName}`;
        await message.channel.setName(finalName);
        return message.reply(`✅ تم تغيير اسم التذكرة إلى: **${finalName}**`);
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
        return message.channel.send(`📢 <@&${CONFIG.STAFF_ROLE_ID}> تم استدعاؤكم بواسطة ${message.author}`);
    }

    // !user (رسالة خاصة)
    if (message.content === '!user') {
        if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
        const ownerId = getTicketOwnerId(message.channel);
        if (!ownerId) return message.reply('❌ ما قدرت ألقى صاحب التذكرة.');

        try {
            const owner = await message.guild.members.fetch(ownerId);
            await owner.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📢 تم استدعاؤك')
                        .setDescription(`تم استدعاؤك إلى تذكرتك في سيرفر **${message.guild.name}**\n\nالروم: ${message.channel}\nبواسطة: ${message.author}`)
                        .setColor('#5865F2')
                        .setTimestamp()
                ]
            });
            return message.reply(`✅ تم إرسال رسالة خاصة إلى <@${ownerId}>`);
        } catch {
            return message.reply('❌ ما قدرت أرسل رسالة خاصة (العضو مسكر الخاص).');
        }
    }
});

// ========== دوال مساعدة ==========
function isTicketChannel(channel) {
    const name = channel.name;
    return name.startsWith('استفسار-') || name.startsWith('شكوى-') || name.startsWith('اقتراح-') ||
           name.startsWith('🔒استفسار-') || name.startsWith('🔒شكوى-') || name.startsWith('🔒اقتراح-');
}

function getTypePrefix(channelName) {
    const clean = channelName.replace('🔒', '');
    if (clean.startsWith('استفسار')) return 'استفسار';
    if (clean.startsWith('شكوى')) return 'شكوى';
    if (clean.startsWith('اقتراح')) return 'اقتراح';
    return 'ticket';
}

function getTicketOwnerId(channel) {
    const overwrite = channel.permissionOverwrites.cache.find(ow =>
        ow.type === 1 &&
        ow.id !== channel.guild.id &&
        ow.allow.has(PermissionFlagsBits.ViewChannel)
    );
    return overwrite ? overwrite.id : null;
}

async function hasOpenTicket(guild, userId) {
    return guild.channels.cache.find(c => {
        if (!isTicketChannel(c)) return false;
        const ow = c.permissionOverwrites.cache.get(userId);
        return ow && ow.allow.has(PermissionFlagsBits.ViewChannel);
    });
}

async function lockTicket(channel, member, interactionOrMessage) {
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (overwrite.type === 1) {
            await channel.permissionOverwrites.edit(id, { SendMessages: false });
        }
    }
    await channel.permissionOverwrites.edit(CONFIG.STAFF_ROLE_ID, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
    });

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

    await interactionOrMessage.reply({ embeds: [embed], components: [row] });
}

async function unlockTicket(channel, interactionOrMessage) {
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (overwrite.type === 1) {
            await channel.permissionOverwrites.edit(id, { SendMessages: true });
        }
    }
    if (channel.name.startsWith('🔒')) {
        await channel.setName(channel.name.replace('🔒', ''));
    }
    await interactionOrMessage.reply({ content: '🔓 تم **فتح** التذكرة مرة ثانية. الجميع يقدر يكتب الآن.' });
}

async function createTicket(interaction, typeKey) {
    await interaction.deferReply({ ephemeral: true });

    const type = TICKET_TYPES[typeKey];
    const existing = await hasOpenTicket(interaction.guild, interaction.user.id);
    if (existing) {
        return interaction.editReply({ 
            content: `❌ عندك تذكرة مفتوحة أصلاً: ${existing}\nأقفلها أولاً قبل ما تفتح واحدة جديدة.` 
        });
    }

    const ticketChannel = await interaction.guild.channels.create({
        name: `${type.prefix}-${interaction.user.username}`.toLowerCase().replace(/\s+/g, '-'),
        type: ChannelType.GuildText,
        parent: CONFIG.CATEGORY_ID,
        topic: `نوع: ${type.label} | صاحب التذكرة: ${interaction.user.id}`,
        permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
    });

    // رسالة داخل التذكرة
    const embed = new EmbedBuilder()
        .setTitle(`${type.emoji} تذكرة ${type.label} — ${interaction.user.username}`)
        .setDescription(`مرحباً بك ${interaction.user}!\n\nاكتب مشكلتك أو استفسارك هنا وسيقوم فريق الدعم بالرد عليك في أقرب وقت.\n\n**نوع التذكرة:** ${type.label}`)
        .setColor(type.color)
        .setFooter({ text: `صاحب التذكرة: ${interaction.user.tag}` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('add_member').setLabel('إضافة عضو').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('call_staff').setLabel('استدعاء الإدارة').setStyle(ButtonStyle.Primary).setEmoji('📢'),
        new ButtonBuilder().setCustomId('call_user').setLabel('استدعاء العضو').setStyle(ButtonStyle.Primary).setEmoji('👤')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rename_ticket').setLabel('تغيير الاسم').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('lock_ticket').setLabel('قفل التذكرة').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    await ticketChannel.send({
        content: `${interaction.user} | <@&${CONFIG.STAFF_ROLE_ID}>`,
        embeds: [embed],
        components: [row1, row2]
    });

    // ========== لوج محسن ==========
    const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`${type.emoji} تذكرة جديدة — ${type.label}`)
            .addFields(
                { name: '👤 العضو', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                { name: '📁 النوع', value: type.label, inline: true },
                { name: '🔗 الروم', value: `${ticketChannel}`, inline: true },
                { name: '🆔 آيدي العضو', value: `\`${interaction.user.id}\``, inline: true },
                { name: '📅 التاريخ', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📌 الحالة', value: '🟢 مفتوحة', inline: true }
            )
            .setColor(type.color)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: `Ticket ID: ${ticketChannel.id}` })
            .setTimestamp();

        const logRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('الانتقال للتذكرة')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticketChannel.id}`)
                .setEmoji('🔗'),
            new ButtonBuilder()
                .setCustomId(`claim_${ticketChannel.id}`)
                .setLabel('استلام التذكرة')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✋')
        );

        await logChannel.send({ embeds: [logEmbed], components: [logRow] });
    }

    await interaction.editReply({ content: `✅ تم فتح تذكرة **${type.label}** بنجاح: ${ticketChannel}` });
}

// ========== التفاعلات ==========
client.on('interactionCreate', async (interaction) => {

    // فتح التذاكر حسب النوع
    if (interaction.isButton() && interaction.customId === 'open_inquiry') {
        return createTicket(interaction, 'inquiry');
    }
    if (interaction.isButton() && interaction.customId === 'open_complaint') {
        return createTicket(interaction, 'complaint');
    }
    if (interaction.isButton() && interaction.customId === 'open_suggestion') {
        return createTicket(interaction, 'suggestion');
    }

    // استلام التذكرة من اللوج
    if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });

        const channelId = interaction.customId.replace('claim_', '');
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return interaction.reply({ content: '❌ التذكرة محذوفة أو غير موجودة.', ephemeral: true });

        // تحديث رسالة اللوج
        const oldEmbed = interaction.message.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed)
            .spliceFields(5, 1, { name: '📌 الحالة', value: `🟡 مستلمة بواسطة ${interaction.user}`, inline: true });

        await interaction.message.edit({ embeds: [newEmbed] });
        await interaction.reply({ content: `✅ استلمت التذكرة ${channel}`, ephemeral: true });

        // إشعار داخل التذكرة
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`✋ **${interaction.user}** استلم هذه التذكرة وسيقوم بالرد عليك قريباً.`)
                    .setColor('#FEE75C')
            ]
        });
        return;
    }

    // إضافة عضو
    if (interaction.isButton() && interaction.customId === 'add_member') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
        return interaction.reply({ content: '➕ استخدم الأمر:\n```!add @العضو```', ephemeral: true });
    }

    // استدعاء الإدارة
    if (interaction.isButton() && interaction.customId === 'call_staff') {
        await interaction.reply({ content: `📢 <@&${CONFIG.STAFF_ROLE_ID}> تم استدعاؤكم بواسطة ${interaction.user}` });
        return;
    }

    // استدعاء العضو (DM)
    if (interaction.isButton() && interaction.customId === 'call_user') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });

        const ownerId = getTicketOwnerId(interaction.channel);
        if (!ownerId) return interaction.reply({ content: '❌ ما قدرت ألقى صاحب التذكرة.', ephemeral: true });

        try {
            const owner = await interaction.guild.members.fetch(ownerId);
            await owner.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📢 تم استدعاؤك')
                        .setDescription(`تم استدعاؤك إلى تذكرتك في سيرفر **${interaction.guild.name}**\n\nالروم: ${interaction.channel}\nبواسطة: ${interaction.user}`)
                        .setColor('#5865F2')
                        .setTimestamp()
                ]
            });
            await interaction.reply({ content: `✅ تم إرسال رسالة خاصة إلى <@${ownerId}>` });
        } catch {
            await interaction.reply({ content: '❌ ما قدرت أرسل رسالة خاصة (العضو مسكر الخاص).', ephemeral: true });
        }
        return;
    }

    // تغيير الاسم (Modal)
    if (interaction.isButton() && interaction.customId === 'rename_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId('rename_modal').setTitle('تغيير اسم التذكرة');
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

    if (interaction.isModalSubmit() && interaction.customId === 'rename_modal') {
        const newName = interaction.fields.getTextInputValue('new_ticket_name').trim().toLowerCase().replace(/\s+/g, '-');
        const isLocked = interaction.channel.name.startsWith('🔒');
        const typePrefix = getTypePrefix(interaction.channel.name);
        const finalName = isLocked ? `🔒${typePrefix}-${newName}` : `${typePrefix}-${newName}`;
        await interaction.channel.setName(finalName);
        await interaction.reply({ content: `✅ تم تغيير اسم التذكرة إلى: **${finalName}**` });
        return;
    }

    // قفل
    if (interaction.isButton() && interaction.customId === 'lock_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
        await lockTicket(interaction.channel, interaction.member, interaction);
        return;
    }

    // فتح
    if (interaction.isButton() && interaction.customId === 'unlock_ticket') {
        const isStaff = interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
        await unlockTicket(interaction.channel, interaction);
        return;
    }

    // حذف / إغلاق
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply({ content: '🗑️ سيتم حذف التذكرة نهائياً بعد **5 ثوانٍ**...' });

        const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ تذكرة محذوفة')
                .setDescription(`تم حذف الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                .addFields(
                    { name: '📅 وقت الحذف', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setColor('#DA373C')
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        setTimeout(async () => {
            try { await interaction.channel.delete(); } 
            catch (err) { console.log('خطأ في حذف الروم:', err); }
        }, 5000);
        return;
    }
});

client.login(process.env.TOKEN);