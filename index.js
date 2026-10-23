const { 
    ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
} = require('discord.js');
const config = require('./config');
const ticket = require('./ticketSystem');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
});

// ===== إعطاء رتبة عضو عند الدخول =====
client.on('guildMemberAdd', async (member) => {
    try {
        if (member.user.bot) return;

        const role = member.guild.roles.cache.get(config.MEMBER_ROLE_ID);
        if (!role) {
            console.error('[AUTOROLE] رتبة العضو غير موجودة، تأكد من الآيدي');
            return;
        }

        await member.roles.add(role);
        console.log(`[AUTOROLE] تم إعطاء رتبة العضو لـ ${member.user.tag}`);
    } catch (err) {
        console.error('[AUTOROLE ERROR]', err);
    }
});

// ===== الأوامر النصية =====
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;

        // أمر !setup
        if (message.content === '!setup') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
            await message.delete().catch(() => {});

            const embed = new EmbedBuilder()
                .setTitle('🎫 نظام التذاكر والدعم الفني')
                .setDescription('اختر نوع التذكرة المناسبة من الأزرار بالأسفل:\n\n❓ **استفسار** — لأي سؤال عام\n⚠️ **شكوى** — لتقديم شكوى\n💡 **اقتراح** — لتقديم اقتراح')
                .setColor('#5865F2')
                .setFooter({ text: 'اضغط على الزر المناسب لفتح تذكرة' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_inquiry').setLabel('استفسار').setStyle(ButtonStyle.Primary).setEmoji('❓'),
                new ButtonBuilder().setCustomId('open_complaint').setLabel('شكوى').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
                new ButtonBuilder().setCustomId('open_suggestion').setLabel('اقتراح').setStyle(ButtonStyle.Success).setEmoji('💡')
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return;
        }

        if (!ticket.isTicketChannel(message.channel)) return;

        const isStaff = message.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                        message.member.permissions.has(PermissionFlagsBits.Administrator);

        // !add
        if (message.content.startsWith('!add ')) {
            if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('❌ منشن العضو.\nمثال: `!add @اسم`');

            const existing = message.channel.permissionOverwrites.cache.get(member.id);
            if (existing && existing.allow.has(PermissionFlagsBits.ViewChannel)) {
                return message.reply(`⚠️ **${member.user.username}** موجود في التذكرة أصلاً.`);
            }

            await message.channel.permissionOverwrites.edit(member.id, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true
            });
            return message.reply(`✅ تم إضافة ${member} إلى التذكرة.`);
        }

        // !remove
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
            const typePrefix = ticket.getTypePrefix(message.channel.name);
            const finalName = isLocked ? `🔒${typePrefix}-${newName}` : `${typePrefix}-${newName}`;
            await message.channel.setName(finalName);
            return message.reply(`✅ تم تغيير اسم التذكرة إلى: **${finalName}**`);
        }

        // !lock
        if (message.content === '!lock') {
            if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
            await ticket.lockTicket(message.channel, message.member, message);
            return;
        }

        // !unlock
        if (message.content === '!unlock') {
            if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
            await ticket.unlockTicket(message.channel, message);
            return;
        }

        // !staff
        if (message.content === '!staff') {
            return message.channel.send(`📢 <@&${config.STAFF_ROLE_ID}> تم استدعاؤكم بواسطة ${message.author}`);
        }

        // !user
        if (message.content === '!user') {
            if (!isStaff) return message.reply('❌ هذا الأمر للإدارة فقط.');
            const ownerId = ticket.getTicketOwnerId(message.channel);
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

    } catch (err) {
        console.error('[MESSAGE ERROR]', err);
    }
});

// ===== التفاعلات (الأزرار) =====
client.on('interactionCreate', async (interaction) => {
    try {
        // فتح التذاكر
        if (interaction.isButton() && interaction.customId === 'open_inquiry') {
            return ticket.createTicket(interaction, 'inquiry');
        }
        if (interaction.isButton() && interaction.customId === 'open_complaint') {
            return ticket.createTicket(interaction, 'complaint');
        }
        if (interaction.isButton() && interaction.customId === 'open_suggestion') {
            return ticket.createTicket(interaction, 'suggestion');
        }

        // استلام التذكرة من اللوق
        if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });

            const channelId = interaction.customId.replace('claim_', '');
            const channel = interaction.guild.channels.cache.get(channelId);
            if (!channel) return interaction.reply({ content: '❌ التذكرة محذوفة أو غير موجودة.', ephemeral: true });

            const oldEmbed = interaction.message.embeds[0];
            const newEmbed = EmbedBuilder.from(oldEmbed)
                .spliceFields(5, 1, { name: '📌 الحالة', value: `🟡 مستلمة بواسطة ${interaction.user}`, inline: true });

            await interaction.message.edit({ embeds: [newEmbed] });
            await interaction.reply({ content: `✅ استلمت التذكرة ${channel}`, ephemeral: true });

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
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
            return interaction.reply({ content: '➕ استخدم الأمر:\n```!add @العضو```', ephemeral: true });
        }

        // استدعاء الإدارة
        if (interaction.isButton() && interaction.customId === 'call_staff') {
            await interaction.reply({ content: `📢 <@&${config.STAFF_ROLE_ID}> تم استدعاؤكم بواسطة ${interaction.user}` });
            return;
        }

        // استدعاء العضو (DM)
        if (interaction.isButton() && interaction.customId === 'call_user') {
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });

            const ownerId = ticket.getTicketOwnerId(interaction.channel);
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

        // تغيير الاسم
        if (interaction.isButton() && interaction.customId === 'rename_ticket') {
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
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
            const typePrefix = ticket.getTypePrefix(interaction.channel.name);
            const finalName = isLocked ? `🔒${typePrefix}-${newName}` : `${typePrefix}-${newName}`;
            await interaction.channel.setName(finalName);
            await interaction.reply({ content: `✅ تم تغيير اسم التذكرة إلى: **${finalName}**` });
            return;
        }

        // قفل
        if (interaction.isButton() && interaction.customId === 'lock_ticket') {
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
            await ticket.lockTicket(interaction.channel, interaction.member, interaction);
            return;
        }

        // فتح
        if (interaction.isButton() && interaction.customId === 'unlock_ticket') {
            const isStaff = interaction.member.roles.cache.has(config.STAFF_ROLE_ID) || 
                            interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isStaff) return interaction.reply({ content: '❌ للإدارة فقط.', ephemeral: true });
            await ticket.unlockTicket(interaction.channel, interaction);
            return;
        }

     // حذف التذكرة + transcript
if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: '🗑️ جاري إنشاء الـ transcript وحذف التذكرة...' });

    try {
        // جلب الرسائل من التذكرة (آخر 100 رسالة)
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const sorted = [...messages.values()].reverse(); // من الأقدم للأحدث

        let transcript = `===== TRANSCRIPT للتذكرة: ${interaction.channel.name} =====\n`;
        transcript += `تاريخ الحذف: ${new Date().toLocaleString('ar-EG')}\n`;
        transcript += `تم الحذف بواسطة: ${interaction.user.tag} (${interaction.user.id})\n`;
        transcript += `========================================\n\n`;

        for (const msg of sorted) {
            const time = msg.createdAt.toLocaleString('ar-EG');
            const author = `${msg.author.tag} (${msg.author.id})`;
            const content = msg.content || '[مرفق / إيمبد / بدون نص]';
            transcript += `[${time}] ${author}:\n${content}\n\n`;
        }

        // إنشاء الملف
        const buffer = Buffer.from(transcript, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { 
            name: `transcript-${interaction.channel.name}.txt` 
        });

        // إرسال اللوق مع الملف
        const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🗑️ تذكرة محذوفة + Transcript')
                .setDescription(`تم حذف الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                .addFields(
                    { name: '📅 وقت الحذف', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
                    { name: '📄 عدد الرسائل', value: `${sorted.length} رسالة` }
                )
                .setColor('#DA373C')
                .setTimestamp();

            await logChannel.send({ 
                embeds: [logEmbed], 
                files: [attachment] 
            });
        }

        // حذف الروم بعد ثانيتين
        setTimeout(async () => {
            try { 
                await interaction.channel.delete(); 
            } catch (err) { 
                console.error('[DELETE ERROR]', err); 
            }
        }, 2000);

    } catch (err) {
        console.error('[TRANSCRIPT ERROR]', err);
        await interaction.followUp({ content: '❌ حصل خطأ أثناء إنشاء الـ transcript، لكن التذكرة راح تنحذف.', ephemeral: true }).catch(() => {});
        
        setTimeout(async () => {
            try { await interaction.channel.delete(); } 
            catch (e) { console.error(e); }
        }, 2000);
    }
    return;
}

client.login(process.env.TOKEN)