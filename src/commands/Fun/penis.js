import { SlashCommandBuilder } from 'discord.js';

const IMAGE_URL =
    'https://cdn.discordapp.com/attachments/1537557802178838688/1538388797413261373/image0.jpg?ex=6a827fb7&is=6a812e37&hm=c5776339740fd149fae321adc687d2bde0ca7ed4968b753dbd752c3af9d92c41&';

export default {
    data: new SlashCommandBuilder()
        .setName('penis')
        .setDescription('Send the image.'),

    category: 'fun',

    async execute(interaction) {
        await interaction.reply({
            files: [IMAGE_URL],
        });
    },
};
