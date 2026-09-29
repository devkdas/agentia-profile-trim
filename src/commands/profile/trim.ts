import {Command, Flags} from '@oclif/core'
import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

interface Finding {
  rule: string
  count: number
  sample: string[]
}

function trimProfile(xml: string): {cleaned: string; findings: Finding[]} {
  const findings: Finding[] = []
  let out = xml

  const trailing = out.match(/[ \t]+$/gm) ?? []
  if (trailing.length > 0) {
    out = out.replace(/[ \t]+$/gm, '')
    findings.push({rule: 'trailing-whitespace', count: trailing.length, sample: ['trailing spaces or tabs at line ends']})
  }

  const blockRe = /(<(?:applicationVisibilities|tabVisibilities|recordTypeVisibilities|objectPermissions|fieldPermissions|userPermissions)>[\s\S]*?<\/(?:applicationVisibilities|tabVisibilities|recordTypeVisibilities|objectPermissions|fieldPermissions|userPermissions)>)/g
  const seen = new Set<string>()
  let dupes = 0
  out = out.replace(blockRe, (block) => {
    const key = block.replace(/\s+/g, ' ')
    if (seen.has(key)) {
      dupes += 1
      return ''
    }
    seen.add(key)
    return block
  })
  if (dupes > 0) findings.push({rule: 'duplicate-blocks', count: dupes, sample: ['verbatim repeated permission blocks']})
  out = out.replace(/\n{3,}/g, '\n\n')
  return {cleaned: out, findings}
}

export default class ProfileTrim extends Command {
  static description =
    'Report noise in Profile XML with an optional safe cleanup. Fully offline, no org calls.'

  static examples = [
    '<%= config.bin %> <%= command.id %> --file ./Admin.profile-meta.xml',
    '<%= config.bin %> <%= command.id %> --file ./Admin.profile-meta.xml --write --out ./Admin.clean.xml --json',
  ]

  static flags = {
    file: Flags.string({char: 'f', description: 'Local Profile XML file.', required: true}),
    out: Flags.string({char: 'o', description: 'Output path when --write is used.'}),
    write: Flags.boolean({description: 'Write the cleaned file. Default is report only.', default: false}),
    json: Flags.boolean({char: 'j', description: 'Machine readable JSON output.', default: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ProfileTrim)
    const file = resolve(process.cwd(), flags.file as string)
    const outPath = (flags.out as string | undefined) ?? null
    const write = (flags.write as boolean) ?? false
    const asJson = (flags.json as boolean) ?? false

    let xml: string
    try {
      xml = readFileSync(file, 'utf8')
    } catch (error: any) {
      const detail = `Could not read file: ${(error?.message ?? String(error)).split('\n')[0]}`
      if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
      else this.log(detail)
      this.exit(1)
    }

    if (!/<Profile[\s>]/.test(xml as string) && !/<\?xml/.test(xml as string)) {
      const detail = 'File does not look like Salesforce Profile XML. Refusing to touch it.'
      if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
      else this.log(detail)
      this.exit(1)
    }

    const {cleaned, findings} = trimProfile(xml as string)
    const removedLines = (xml as string).split('\n').length - cleaned.split('\n').length
    const payload = {
      status: 'analyzed',
      file,
      rules: findings,
      removedLines,
      written: null as string | null,
    }

    if (write) {
      if (!outPath) {
        const detail = 'Pass --out with --write so the original file is never overwritten in place.'
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
      const dest = resolve(process.cwd(), outPath)
      writeFileSync(dest, cleaned, 'utf8')
      payload.written = dest
    }

    if (asJson) {
      this.log(JSON.stringify(payload, null, 2))
    } else {
      this.log(`Profile noise report for ${file}: ${removedLines} removable lines across ${findings.length} rules.`)
      for (const f of findings) this.log(`  - ${f.rule}: ${f.count}`)
      if (write) this.log(`Cleaned file written to ${payload.written}. Original untouched.`)
      else this.log('Report only. Nothing written. Add --write --out <path> to apply.')
    }
  }
}
