const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 👇👇 شيل الكلمات وحط الأرقام (IDs) الخاصة بسيرفرك هنا 👇👇
const CONFIG = {
    CATEGORY_ID:  '1559308775653900429', 
    STAFF_ROLE_ID: '1559309508688216115',
    LOG_CHANNEL_ID: '1559308944927883294'
};

client.once('ready', () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
});

// الأوامر الكتابية
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        await message.delete();

        const embed = new EmbedBuilder()
            .setTitle('🎫 مركز الدعم الفني المتطور')
            .setDescription('مرحباً بك. يرجى اختيار القسم المناسب لمشكلتك بالضغط على أحد الأزرار بالأسفل:')
            .setColor('#5865F2');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_general').setLabel('دعم عام').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
            new ButtonBuilder().setCustomId('ticket_tech').setLabel('مشاكل تقنية').setStyle(ButtonStyle.Success).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('ticket_buy').setLabel('شراء / شحن').setStyle(ButtonStyle.Danger).setEmoji('💰')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (!message.channel.name.startsWith('ticket-')) return;

    if (message.content === '!close') {
        await message.reply({ content: '🔒 سيتم إغلاق التذكرة وحذف هذا الروم بعد 5 ثوانٍ...' });
        return handleTicketClose(message.channel, message.author);
    }

    if (message.content.startsWith('!rename ')) {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return message.reply({ content: '❌ هذا الأمر للدعم فقط!' });
        const newName = message.content.replace('!rename ', '').trim().replace(/ /g, '-');
        await message.channel.setName(`ticket-${newName}`);
        return message.reply({ content: `✏️ تم تغيير اسم التذكرة إلى: **ticket-${newName}**` });
    }

    if (message.content.startsWith('!add ')) {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return message.reply({ content: '❌ هذا الأمر للدعم فقط!' });
        const userId = message.content.replace('!add ', '').trim();
        try {
            const member = await message.guild.members.fetch(userId);
            await message.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true, AttachFiles: true });
            return message.reply({ content: `➕ تم إضافة العضو ${member} بنجاح.` });
        } catch (error) {
            return message.reply({ content: '❌ الـ ID غير صحيح.' });
        }
    }

    if (message.content === '!staff') {
        return message.reply({ content: `🚨 <@&${CONFIG.STAFF_ROLE_ID}>، العضو ${message.author} يستدعيكم!` });
    }

    if (message.content === '!user') {
        if (!message.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return message.reply({ content: '❌ للدعم فقط!' });
        const memberId = message.channel.topic;
        if (memberId) return message.reply({ content: `🔔 <@${memberId}>، فريق الدعم بانتظارك الآن.` });
    }
});

// الأزرار والتفاعلات
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_')) {
            await interaction.deferReply({ ephemeral: true });
            let typeLabel = 'عام';
            if (interaction.customId === 'ticket_tech') typeLabel = 'تقني';
            if (interaction.customId === 'ticket_buy') typeLabel = 'شحن';

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${typeLabel}-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: CONFIG.CATEGORY_ID,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, 
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }, 
                    { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] } 
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle(`🎯 تذكرة ${typeLabel}`)
                .setDescription(`مرحباً بك ${interaction.user}.\nاستخدم الأزرار بالأسفل أو اكتب الأوامر للتحكم بالتذكرة.\n\n**📜 الأوامر:**\n\`!close\` | \`!rename\` | \`!add\` | \`!staff\` | \`!user\``)
                .setColor('#248046');

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('claim_ticket_btn').setLabel('استلام').setStyle(ButtonStyle.Secondary).setEmoji('🙋‍♂️')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('rename_ticket_btn').setLabel('اسم الروم').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
                new ButtonBuilder().setCustomId('add_user_btn').setLabel('عضو').setStyle(ButtonStyle.Primary).setEmoji('➕'),
                new ButtonBuilder().setCustomId('call_staff_btn').setLabel('نداء الإدارة').setStyle(ButtonStyle.Success).setEmoji('🚨'),
                new ButtonBuilder().setCustomId('call_user_btn').setLabel('تنبيه العضو').setStyle(ButtonStyle.Warning).setEmoji('🔔')
            );

            await ticketChannel.setTopic(interaction.user.id);
            await ticketChannel.send({ embeds: [embed], components: [row1, row2] });
            await interaction.editReply({ content: `تم فتح تذكرتك هنا: ${ticketChannel}`, ephemeral: true });
        }

        if (interaction.customId === 'close_ticket_btn') {
            await interaction.reply({ content: '🔒 سيتم الحذف بعد 5 ثوانٍ...' });
            await handleTicketClose(interaction.channel, interaction.user);
        }

        if (interaction.customId === 'claim_ticket_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ للدعم فقط!', ephemeral: true });
            await interaction.reply({ content: `🙋‍♂️ الإداري ${interaction.user} استلم التذكرة.` });
        }

        if (interaction.customId === 'rename_ticket_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ للدعم فقط!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('تغيير اسم التذكرة');
            const nameInput = new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد للروم:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'add_user_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ للدعم فقط!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('إضافة عضو');
            const userInput = new TextInputBuilder().setCustomId('user_id_input').setLabel('ضع الـ ID الخاص بالعضو:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'call_staff_btn') {
            await interaction.reply({ content: `🚨 <@&${CONFIG.STAFF_ROLE_ID}>، العضو ${interaction.user} يستدعيكم!` });
        }

        if (interaction.customId === 'call_user_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ للدعم فقط!', ephemeral: true });
            const memberId = interaction.channel.topic;
            if (memberId) await interaction.reply({ content: `🔔 <@${memberId}>، فريق الدعم بانتظارك.` });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_rename') {
            const newName = interaction.fields.getTextInputValue('new_name').replace(/ /g, '-');
            await interaction.channel.setName(`ticket-${newName}`);
            await interaction.reply({ content: `✏️ تم تغيير الاسم إلى: **ticket-${newName}**` });
        }

        if (interaction.customId === 'modal_add_user') {
            const userId = interaction.fields.getTextInputValue('user_id_input');
            try {
                const member = await interaction.guild.members.fetch(userId);
                await interaction.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true, AttachFiles: true });
                await interaction.reply({ content: `➕ تم إضافة العضو ${member} بنجاح.` });
            } catch (error) {
                await interaction.reply({ content: '❌ الـ ID غير صحيح.', ephemeral: true });
            }
        }
    }
});

async function handleTicketClose(channel, user) {
    const logChannel = channel.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logChannel) {
        const logEmbed = new EmbedBuilder().setTitle('🔒 تذكرة مغلقة').setDescription(`**الروم:** ${channel.name}\n**أغلقها:** ${user}`).setColor('#DA373C').setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
    }
    setTimeout(async () => { try { await channel.delete(); } catch (err) { console.log(err); } }, 5000);
}
client.login(process.env.TOKEN);