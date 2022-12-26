import { Context, Schema } from 'koishi'

export const name = 'shutdown'

export const Config: Schema<{}> = Schema.object({})

interface Pending {
  timeout: NodeJS.Timeout
  reboot: boolean
  date: Date
}

export function apply(ctx: Context) {
  const pendings: Pending[] = []

  ctx
    .command(
      'shutdown [time:string] [wall:text]',
      'Power off or reboot Koishi',
      { authority: 4 }
    )
    .usage(
      `
shutdown may be used to power off or reboot Koishi.
The first argument may be a time string (which is usually "now"). Optionally, this may be followed by a wall message to be sent to all logged-in users before going down.
The time string may either be in the format "hh:mm" for hour/minutes specifying the time to execute the shutdown at, specified in 24h clock format. Alternatively it may be in the syntax "+m" referring to the specified number of minutes m from now. "now" is an alias for "+0", i.e. for triggering an immediate shutdown. If no time argument is specified, "+1" is implied.
Note that to specify a wall message you must specify a time argument, too.
If the time argument is used, 5 minutes before the system goes down the /run/nologin file is created to ensure that further logins shall not be allowed.
    `.trim()
    )
    .option('reboot', '-r Reboot Koishi.', { fallback: false })
    .option(
      'k',
      '-k Do not power off or reboot, but just write the wall message.',
      { fallback: false }
    )
    .option('no-wall', 'Do not send wall message before power off or reboot.', {
      fallback: false,
    })
    .option(
      'c',
      '-c Cancel a pending shutdown. This may be used to cancel the effect of an invocation of shutdown with a time argument that is not "+0" or "now".',
      { fallback: false }
    )
    .option(
      'show',
      'Show a pending shutdown action and time if there is any.',
      { fallback: false }
    )
    .action(({ options }, time, wall) => {
      // Handle --show
      if (options.show) {
        if (!pendings.length) return "There's no pending shutdown."

        let result = 'Pending shutdowns:\n'
        for (const pending of pendings)
          result += `${pending.reboot ? 'Reboot' : 'Shutdown'} scheduled at: ${
            pending.date
          }\n`

        return result.trim()
      }

      // Handle -c
      if (options.c) {
        if (!pendings.length) return "There's no pending shutdown."

        for (const pending of pendings) clearTimeout(pending.timeout)
        pendings.splice(0, pendings.length)

        if (!options['no-wall'])
          ctx.broadcast('The system shutdown has been cancelled')
        return 'Cleared all pending shutdowns.'
      }

      let parsedTime = parseTime(time || '+1')
      if (time === '+0' || time === 'now') parsedTime = 0
      else if (!parsedTime) return `Failed to parse time specification: ${time}`

      const reboot = options.reboot
      const date = new Date(new Date().getTime() + parsedTime)
      const parsedWall =
        wall ||
        `The system is going down for ${
          reboot ? 'reboot' : 'poweroff'
        } at ${date}`

      pendings.push({
        timeout: setTimeout(() => process.exit(reboot ? 52 : 0), parsedTime),
        reboot,
        date,
      })

      if (!options['no-wall']) ctx.broadcast(parsedWall)
      return `${
        reboot ? 'Reboot' : 'Shutdown'
      } scheduled for ${date}, use 'shutdown -c' to cancel.`
    })
}

function parseTime(time: string) {
  if (!time) return false
  const hhmm = parseHhmm(time)
  if (hhmm) return hhmm
  return parseMinutes(time)
}

function parseHhmm(time: string) {
  const splits = time.split(':')
  if (splits.length !== 2) return false
  const nums = splits.map((x) => Number(x))
  if (!nums[0] || !nums[1]) return false
  if (nums[0] < 0 || nums[1] < 0) return false
  if (nums[0] > 23 || nums[1] > 59) return false
  const date = new Date()
  date.setHours(nums[0])
  date.setMinutes(nums[1])
  date.setSeconds(0)
  date.setMilliseconds(0)
  let dateNum = date.getTime()
  const nowNum = new Date().getTime()
  if (dateNum < nowNum) dateNum += 86400000
  return dateNum - nowNum
}

function parseMinutes(time: string) {
  if (!time.startsWith('+')) return false
  const num = Number(time)
  if (!num || num < 0) return false
  return num * 60000
}
