const { 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const config = require('./config');

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

async function lockTicket(channel, member, replyTarget) {
    try {
        for (const [id, overwrite] of channel.permissionOverwrites.cache) {
            if (overwrite.type === 1) {
                await channel.permissionOverwrites.edit(id, { SendMessages: false });
            }
        }
        await channel.permissionOverwrites.edit(config.STAFF_ROLE_ID, {
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
            new ButtonBuilder().setCustomId('unlock_ticket').setLabel('فتح التذكرة').setStyle(ButtonStyle.Success).setEmoji('🔓'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await replyTarget.reply({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error('[LOCK ERROR]', err);
        await replyTarget.reply({ content: '❌ حصل خطأ أثناء قفل التذكرة.', ephemeral: true }).catch(() => {});
    }
}

async function unlockTicket(channel, replyTarget) {
    try {
        for (const [id, overwrite] of channel.permissionOverwrites.cache) {
            if (overwrite.type === 1) {
                await channel.permissionOverwrites.edit(id, { SendMessages: true });
            }
        }
        if (channel.name.startsWith('🔒')) {
            await channel.setName(channel.name.replace('🔒', ''));
        }
        await replyTarget.reply({ content: '🔓 تم **فتح** التذكرة مرة ثانية. الجميع يقدر يكتب الآن.' });
    } catch (err) {
        console.error('[UNLOCK ERROR]', err);
        await replyTarget.reply({ content: '❌ حصل خطأ أثناء فتح التذكرة.', ephemeral: true }).catch(() => {});
    }
}

async function createTicket(interaction, typeKey) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const type = config.TICKET_TYPES[typeKey];
        const existing = await hasOpenTicket(interaction.guild, interaction.user.id);

        if (existing) {
            return interaction.editReply({ 
                content: `❌ عندك تذكرة مفتوحة أصلاً: ${existing}\nأقفلها أولاً قبل ما تفتح واحدة جديدة.` 
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: `${type.prefix}-${interaction.user.username}`.toLowerCase().replace(/\s+/g, '-'),
            type: ChannelType.GuildText,
            parent: config.CATEGORY_ID,
            topic: `نوع: ${type.label} | صاحب التذكرة: ${interaction.user.id}`,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: config.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle(`${type.emoji} تذكرة ${type.label} — ${interaction.user.username}`)
            .setDescription(`مرحباً بك ${interaction.user}!\n\nاكتب مشكلتك أو استفسارك هنا وسيقوم فريق الدعم بالرد عليك.\n\n**نوع التذكرة:** ${type.label}`)
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
            content: `${interaction.user} | <@&${config.STAFF_ROLE_ID}>`,
            embeds: [embed],
            components: [row1, row2]
        });

        // ===== لوق محسن =====
        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
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
        console.log(`[TICKET] تم إنشاء تذكرة ${type.label} بواسطة ${interaction.user.tag}`);
    } catch (err) {
        console.error('[CREATE TICKET ERROR]', err);
        await interaction.editReply({ content: '❌ حصل خطأ أثناء إنشاء التذكرة. راجع اللوق.' }).catch(() => {});
    }
}

module.exports = {
    isTicketChannel,
    getTypePrefix,
    getTicketOwnerId,
    hasOpenTicket,
    lockTicket,
    unlockTicket,
    createTicket
};