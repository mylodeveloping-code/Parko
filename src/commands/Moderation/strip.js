import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

/*
 * Stores the roles that were removed from each member.
 *
 * Key:
 *   guild ID + user ID
 *
 * Value:
 *   Array of role IDs that were removed.
 *
 * This allows /strip to work as a toggle:
 *
 * First use  -> remove roles
 * Second use -> restore roles
 */
const strippedMembers = new Map();

function getStorageKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getRemovableRoles(member) {
  return member.roles.cache.filter(
    (role) =>
      role.id !== member.guild.id &&
      !role.managed &&
      role.editable
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('strip')
    .setDescription('Toggle all removable roles for a member')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to strip or restore')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    ),

  category: 'moderation',

  async execute(interaction) {
    const user =
      interaction.options.getUser('user');

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {
      return await replyUserError(interaction, {
        type: ErrorTypes.NOT_FOUND,
        message: 'That member could not be found.',
      });
    }

    const storageKey =
      getStorageKey(
        interaction.guild.id,
        member.id
      );

    try {
      /*
       * ==========================================
       * RESTORE
       * ==========================================
       *
       * If this member was previously stripped,
       * restore the roles that were removed.
       */
      if (strippedMembers.has(storageKey)) {
        const savedRoleIds =
          strippedMembers.get(storageKey);

        const rolesToRestore = [];

        for (const roleId of savedRoleIds) {
          const role =
            interaction.guild.roles.cache.get(roleId);

          if (
            role &&
            !role.managed &&
            role.editable
          ) {
            rolesToRestore.push(role);
          }
        }

        if (rolesToRestore.length === 0) {
          strippedMembers.delete(storageKey);

          return await InteractionHelper.safeReply(
            interaction,
            {
              embeds: [
                successEmbed(
                  'No Roles Restored',
                  `There are no saved roles that I can restore for ${member.user}.`
                ),
              ],
              flags: MessageFlags.Ephemeral,
            }
          );
        }

        await member.roles.add(
          rolesToRestore,
          `Roles restored by ${interaction.user.tag}`
        );

        strippedMembers.delete(storageKey);

        return await InteractionHelper.safeReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'Roles Restored',
                `Restored **${rolesToRestore.length}** role(s) to ${member.user}.`
              ),
            ],
            flags: MessageFlags.Ephemeral,
          }
        );
      }

      /*
       * ==========================================
       * STRIP
       * ==========================================
       *
       * Get every role the bot is allowed to remove
       * and save their IDs before removing them.
       */
      const removableRoles =
        getRemovableRoles(member);

      if (removableRoles.size === 0) {
        return await InteractionHelper.safeReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'No Roles To Strip',
                `${member.user} does not have any removable roles.`
              ),
            ],
            flags: MessageFlags.Ephemeral,
          }
        );
      }

      const roleIds =
        [...removableRoles.values()]
          .map((role) => role.id);

      // Remember the roles so they can be restored later.
      strippedMembers.set(
        storageKey,
        roleIds
      );

      await member.roles.remove(
        removableRoles,
        `Roles stripped by ${interaction.user.tag}`
      );

      await InteractionHelper.safeReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Roles Stripped',
              `Removed **${removableRoles.size}** role(s) from ${member.user}. Run **/strip** again to restore them.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        }
      );
    } catch (error) {
      logger.error(
        'Strip command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'I could not modify that member\'s roles. Make sure my highest role is above the roles I am trying to manage.',
      });
    }
  },

  async messageExecute(message, args) {
    const raw =
      Array.isArray(args)
        ? args[0]
        : args;

    if (!raw) {
      return;
    }

    const member =
      message.mentions.members.first() ||
      await message.guild.members
        .fetch(
          String(raw).replace(/[<@!>]/g, '')
        )
        .catch(() => null);

    if (!member) {
      return;
    }

    const storageKey =
      getStorageKey(
        message.guild.id,
        member.id
      );

    try {
      /*
       * ==========================================
       * RESTORE
       * ==========================================
       */
      if (strippedMembers.has(storageKey)) {
        const savedRoleIds =
          strippedMembers.get(storageKey);

        const rolesToRestore = [];

        for (const roleId of savedRoleIds) {
          const role =
            message.guild.roles.cache.get(roleId);

          if (
            role &&
            !role.managed &&
            role.editable
          ) {
            rolesToRestore.push(role);
          }
        }

        if (rolesToRestore.length === 0) {
          strippedMembers.delete(storageKey);
          return;
        }

        await member.roles.add(
          rolesToRestore,
          `Roles restored by ${message.author.tag}`
        );

        strippedMembers.delete(storageKey);

        await message.react('👍').catch(() => {});
        return;
      }

      /*
       * ==========================================
       * STRIP
       * ==========================================
       */
      const removableRoles =
        getRemovableRoles(member);

      if (removableRoles.size === 0) {
        return;
      }

      const roleIds =
        [...removableRoles.values()]
          .map((role) => role.id);

      // Remember the roles for the next toggle.
      strippedMembers.set(
        storageKey,
        roleIds
      );

      await member.roles.remove(
        removableRoles,
        `Roles stripped by ${message.author.tag}`
      );

      await message.react('👍').catch(() => {});
    } catch (error) {
      logger.error(
        'Prefix strip command error:',
        error
      );
    }
  },
};