const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const CONFIG = {
    CATEGORY_ID: '1559308775653900429', 
    STAFF_ROLE_ID: '1559309508688216115',
    LOG_CHANNEL_ID: '1559308944927883294'
};

client.once('ready', () => {
    console.log(`✅ Bot is online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        await message.delete();

        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket System')
            .setDescription('Click a button below to open a ticket:')
            .setColor('#5865F2');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_general').setLabel('General').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
            new ButtonBuilder().setCustomId('ticket_tech').setLabel('Tech').setStyle(ButtonStyle.Success).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('ticket_buy').setLabel('Buy').setStyle(ButtonStyle.Danger).setEmoji('💰')
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (!message.channel.name.startsWith('ticket-')) return;

    if (message.content === '!close') {
        await message.reply('🔒 Closing in 5 seconds...');
        return handleTicketClose(message.channel, message.author);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_')) {
            await interaction.reply({ content: '⏳ Creating ticket...', ephemeral: true });

            let label = 'general';
            if (interaction.customId === 'ticket_tech') label = 'tech';
            if (interaction.customId === 'ticket_buy') label = 'shop';

            try {
                const ch = await interaction.guild.channels.create({
                    name: `ticket-${label}-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: CONFIG.CATEGORY_ID,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const embed = new EmbedBuilder()
                    .setTitle(`🎯 ${label.toUpperCase()} TICKET`)
                    .setDescription('Use buttons below to manage this ticket:')
                    .setColor('#248046');

                const r1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                    new ButtonBuilder().setCustomId('claim_ticket_btn').setLabel('Claim').setStyle(ButtonStyle.Secondary).setEmoji('🙋‍♂️')
                );

                const r2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('rename_ticket_btn').setLabel('Rename').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
                    new ButtonBuilder().setCustomId('add_user_btn').setLabel('Add User').setStyle(ButtonStyle.Primary).setEmoji('➕'),
                    new ButtonBuilder().setCustomId('call_staff_btn').setLabel('Call Staff').setStyle(ButtonStyle.Success).setEmoji('🚨'),
                    new ButtonBuilder().setCustomId('call_user_btn').setLabel('Ping User').setStyle(ButtonStyle.Warning).setEmoji('🔔')
                );

                await ch.setTopic(interaction.user.id);
                await ch.send({ embeds: [embed], components: [r1, r2] });
                return await interaction.editReply(`✅ Created: ${ch}`);
            } catch (err) {
                return await interaction.editReply('❌ Error creating channel.');
            }
        }

        if (interaction.customId === 'close_ticket_btn') {
            await interaction.reply('🔒 Closing in 5 seconds...');
            await handleTicketClose(interaction.channel, interaction.user);
        }

        if (interaction.customId === 'claim_ticket_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Staff only!', ephemeral: true });
            await interaction.reply(`🙋‍♂️ Staff ${interaction.user} claimed this ticket.`);
        }

        if (interaction.customId === 'rename_ticket_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Staff only!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_rename').setTitle('Rename');
            const input = new TextInputBuilder().setCustomId('new_name').setLabel('New Name:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'add_user_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Staff only!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('Add User');
            const input = new TextInputBuilder().setCustomId('user_id_input').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'call_staff_btn') {
            await interaction.reply(`🚨 <@&${CONFIG.STAFF_ROLE_ID}>, help needed!`);
        }

        if (interaction.customId === 'call_user_btn') {
            if (!interaction.member.roles.cache.has(CONFIG.STAFF_ROLE_ID)) return interaction.reply({ content: '❌ Staff only!', ephemeral: true });
            const id = interaction.channel.topic;
            if (id) await interaction.reply(`🔔 <@${id}>, staff is waiting.`);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_rename') {
            const name = interaction.fields.getTextInputValue('new_name').replace(/ /g, '-');
            await interaction.channel.setName(`ticket-${name}`);
            await interaction.reply(`✏️ Renamed: **ticket-${name}**`);
        }

        if (interaction.customId === 'modal_add_user') {
            const id = interaction.fields.getTextInputValue('user_id_input');
            try {
                const member = await interaction.guild.members.fetch(id);
                await interaction.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true });
                await interaction.reply(`➕ Added ${member}`);
            } catch (e) {
                await interaction.reply({ content: '❌ Invalid ID.', ephemeral: true });
            }
        }
    }
});

async function handleTicketClose(channel, user) {
    const log = channel.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (log) {
        const embed = new EmbedBuilder().setTitle('🔒 Closed').setDescription(`**Channel:** ${channel.name}\n**By:** ${user}`).setColor('#DA373C').setTimestamp();
        await log.send({ embeds: [embed] });
    }
    setTimeout(async () => { try { await channel.delete(); } catch (e) {} }, 5000);
}

client.login(process.env.TOKEN);
