const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 👇👇 تعديل الأرقام هنا مهم جداً لكي يشتغل البوت في سيرفرك 👇👇
const CONFIG = {
    CATEGORY_ID: '1559308775653900429', 
    STAFF_ROLE_ID: '1559309508688216115',
    LOG_CHANNEL_ID: '1559308944927883294'
};

client.once('ready', () => {
    console.log(`✅ البوت شغال الآن باسم: ${client.user.tag}`);
});

// أمر إنشاء لوحة التذاكر
client.on('messageCreate', async (message) => {
    if (message.content === '!setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        
        await message.delete();

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
    }
});

// التعامل مع الضغط على الأزرار
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // 1. عند الضغط على فتح تذكرة
    if (interaction.customId === 'open_ticket') {
        await interaction.deferReply({ ephemeral: true });

        const ticketName = `ticket-${interaction.user.username}`;
        
        // إنشاء الروم وتحديد الصلاحيات
        const ticketChannel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: CONFIG.CATEGORY_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, // يخفي الروم عن السيرفر كله
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }, // يظهره لصاحب التذكرة
                { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] } // يظهره للدعم
            ]
        });

        const embed = new EmbedBuilder()
            .setTitle(`مرحباً بك ${interaction.user.username}`)
            .setDescription('تم فتح التذكرة الخاصة بك. يرجى كتابة مشكلتك هنا وسيقوم فريق الدعم بالرد عليك في أقرب وقت.')
            .setColor('#248046');

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('إغلاق التذكرة')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const row = new ActionRowBuilder().addComponents(closeButton);

        await ticketChannel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: `تم فتح تذكرتك بنجاح هنا: ${ticketChannel}`, ephemeral: true });
    }

    // 2. عند الضغط على إغلاق التذكرة
    if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: 'سيتم إغلاق التذكرة وحذف الروم بعد 5 ثوانٍ...' });

        // إرسال سجل إلى روم الـ Logs
        const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🔒 تذكرة مغلقة')
                .setDescription(`تم إغلاق الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                .setColor('#DA373C')
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        // حذف الروم بعد 5 ثوانٍ
        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (err) {
                console.log('خطأ في حذف الروم:', err);
            }
        }, 5000);
    }
});

// هنا نضع التوكن من خلال الـ Railway لاحقاً
client.login(process.env.TOKEN);

