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
    .command('shutdown [time:string] [wall:text]', { authority: 4 })
    .option('reboot', '-r', { fallback: false })
    .option('k', '-k', { fallback: false })
    .option('no-wall', '', { fallback: false })
    .option('c', '-c', { fallback: false })
    .option('show', '', { fallback: false })
    .action(({ options, session }, time, wall) => {
      // Handle --show
      if (options.show) {
        if (!pendings.length) return session.text('.no-pending')
        const result = [session.text('.list-header')]
        for (const pending of pendings) {
          const type = session.text(`.types.${pending.reboot ? 'reboot' : 'shutdown'}`)
          result.push(session.text('.list-item', [type, pending.date]))
        }
        return result.join('\n')
      }

      // Handle -c
      if (options.c) {
        if (!pendings.length) return session.text('.no-pending')

        for (const pending of pendings.splice(0)) {
          clearTimeout(pending.timeout)
        }

        if (!options['no-wall']) {
          ctx.broadcast(<i18n path="commands.shutdown.wall-messages.cancel"/>)
        }
        return session.text('.cancel')
      }

      let parsedTime = parseTime(time || '+1')
      if (time === '+0' || time === 'now') parsedTime = 0
      else if (!parsedTime) return session.text('.invalid-time', [time])

      const reboot = options.reboot
      const date = new Date(new Date().getTime() + parsedTime)
      const action = reboot ? 'reboot' : 'poweroff'

      pendings.push({
        timeout: setTimeout(() => process.exit(reboot ? 52 : 0), parsedTime),
        reboot,
        date,
      })

      if (!options['no-wall']) {
        const path = `commands.shutdown.wall-messages.${action}`
        ctx.broadcast(wall || <i18n path={path}>{date}</i18n>)
      }
      return session.text('.' + action, [date])
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
