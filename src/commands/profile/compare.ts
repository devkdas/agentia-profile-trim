import {Command, Flags} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

function runAgentia(args: string[], timeoutMs = 120_000): string {
  return execFileSync('agentia', args, {encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe']})
}

interface GrantSet {
  fields: Map<string, string>
  objects: Map<string, string>
  misc: Map<string, string>
}

function summarizeBlock(block: string): string {
  const parts: string[] = []
  const tagRe = /<([a-zA-Z]+)>([^<>]*)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(block)) !== null) {
    const v = m[2].trim()
    if (v !== '') parts.push(`${m[1]}=${v}`)
  }
  return parts.join(' ').slice(0, 200)
}

const MISC_BLOCKS: Array<{tag: string; kind: string; keys: string[]}> = [
  {tag: 'tabVisibilities', kind: 'tab', keys: ['tab']},
  {tag: 'applicationVisibilities', kind: 'app', keys: ['application']},
  {tag: 'recordTypeVisibilities', kind: 'recordtype', keys: ['recordType']},
  {tag: 'userPermissions', kind: 'userperm', keys: ['name']},
  {tag: 'classAccesses', kind: 'class', keys: ['apexClass']},
  {tag: 'pageAccesses', kind: 'page', keys: ['apexPage']},
]

function parseGrants(xml: string): GrantSet {
  const fields = new Map<string, string>()
  const objects = new Map<string, string>()
  const misc = new Map<string, string>()
  const fieldRe = /<fieldPermissions>([\s\S]*?)<\/fieldPermissions>/g
  let m: RegExpExecArray | null
  while ((m = fieldRe.exec(xml)) !== null) {
    const block = m[1]
    const field = (/<field>([\s\S]*?)<\/field>/.exec(block)?.[1] ?? '').trim()
    if (field === '') continue
    const r = /<readable>\s*true\s*<\/readable>/i.test(block)
    const e = /<editable>\s*true\s*<\/editable>/i.test(block)
    fields.set(field, `readable=${r} editable=${e}`)
  }
  const objRe = /<objectPermissions>([\s\S]*?)<\/objectPermissions>/g
  while ((m = objRe.exec(xml)) !== null) {
    const block = m[1]
    const object = (/<object>([\s\S]*?)<\/object>/.exec(block)?.[1] ?? '').trim()
    if (object === '') continue
    const ar = /<allowRead>\s*true\s*<\/allowRead>/i.test(block)
    const ma = /<modifyAllRecords>\s*true\s*<\/modifyAllRecords>/i.test(block)
    const va = /<viewAllRecords>\s*true\s*<\/viewAllRecords>/i.test(block)
    objects.set(object, `allowRead=${ar} modifyAll=${ma} viewAll=${va}`)
  }
  for (const def of MISC_BLOCKS) {
    const re = new RegExp(`<${def.tag}>([\\s\\S]*?)<\\/${def.tag}>`, 'g')
    let mm: RegExpExecArray | null
    while ((mm = re.exec(xml)) !== null) {
      const block = mm[1]
      let target = ''
      for (const key of def.keys) {
        const hit = new RegExp(`<${key}>([\\s\\S]*?)<\\/${key}>`).exec(block)?.[1]?.trim()
        if (hit) {
          target = hit
          break
        }
      }
      if (target === '') continue
      misc.set(`${def.kind}:${target}`, summarizeBlock(block))
    }
  }
  return {fields, objects, misc}
}

function extractContent(parsed: any): string | null {
  if (parsed == null) return null
  if (typeof parsed === 'string') return parsed
  const root = parsed?.result ?? parsed
  if (typeof root === 'string') return root
  if (typeof root !== 'object') return null
  for (const key of ['content', 'file', 'body', 'data', 'xml', 'source']) {
    const v = (root as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return null
}

export default class ProfileCompare extends Command {
  static description =
    'Side by side diff of two profiles from files or environments. Read only.'

  static examples = [
    '<%= config.bin %> <%= command.id %> --file-a old.xml --file-b new.xml',
    '<%= config.bin %> <%= command.id %> --profile Admin --source-credential-id a11 --source-org-id 00D --target-credential-id a22 --target-org-id 00E --json',
  ]

  static flags = {
    'file-a': Flags.string({description: 'Older local Profile XML file.'}),
    'file-b': Flags.string({description: 'Newer local Profile XML file.'}),
    profile: Flags.string({char: 'p', description: 'Profile API name for org mode.'}),
    'source-credential-id': Flags.string({description: 'Source org credential ID for org mode.'}),
    'source-org-id': Flags.string({description: 'Source org ID for org mode.'}),
    'target-credential-id': Flags.string({description: 'Target org credential ID for org mode.'}),
    'target-org-id': Flags.string({description: 'Target org ID for org mode.'}),
    'pipeline-id': Flags.string({description: 'Pipeline ID scoping gateway calls.'}),
    json: Flags.boolean({char: 'j', description: 'Machine readable JSON output.', default: false}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ProfileCompare)
    const fileA = (flags['file-a'] as string | undefined) ?? null
    const fileB = (flags['file-b'] as string | undefined) ?? null
    const profile = (flags.profile as string | undefined) ?? null
    const asJson = (flags.json as boolean) ?? false

    let xmlA: string | null = null
    let xmlB: string | null = null
    let labelA = ''
    let labelB = ''

    if (fileA && fileB) {
      try {
        xmlA = readFileSync(resolve(process.cwd(), fileA), 'utf8')
        xmlB = readFileSync(resolve(process.cwd(), fileB), 'utf8')
        labelA = fileA
        labelB = fileB
      } catch (error: any) {
        const detail = `Could not read files: ${(error?.message ?? String(error)).split('\n')[0]}`
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
    } else if (profile) {
      const sCred = flags['source-credential-id'] as string | undefined
      const sOrg = flags['source-org-id'] as string | undefined
      const tCred = flags['target-credential-id'] as string | undefined
      const tOrg = flags['target-org-id'] as string | undefined
      const pipeline = flags['pipeline-id'] as string | undefined
      if (!sCred || !sOrg || !tCred || !tOrg) {
        const detail = 'Org mode needs source plus target credential and org IDs, or pass --file-a plus --file-b.'
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
      const fetchArgs = (cred: string, org: string): string[] => {
        const args = ['cicd', 'metadata', 'content', 'get', '--api-name', profile as string,
          '--metadata-type', 'Profile', '--source-credential-id', cred, '--source-org-id', org, '--json']
        if (pipeline) args.push('--pipeline-id', pipeline)
        return args
      }
      try {
        xmlA = extractContent(JSON.parse(runAgentia(fetchArgs(sCred as string, sOrg as string))))
      } catch (error: any) {
        const detail = `Source fetch failed: ${(error?.message ?? String(error)).split('\n')[0]}`
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
      try {
        xmlB = extractContent(JSON.parse(runAgentia(fetchArgs(tCred as string, tOrg as string))))
      } catch (error: any) {
        const detail = `Target fetch failed: ${(error?.message ?? String(error)).split('\n')[0]}`
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
      if (!xmlA || !xmlB) {
        const detail = 'One side returned no comparable content.'
        if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
        else this.log(detail)
        this.exit(1)
      }
      labelA = `source:${profile}`
      labelB = `target:${profile}`
    } else {
      const detail = 'Pass --file-a plus --file-b, or --profile with both org credential pairs.'
      if (asJson) this.log(JSON.stringify({status: 'error', detail}, null, 2))
      else this.log(detail)
      this.exit(1)
    }

    const a = parseGrants(xmlA as string)
    const b = parseGrants(xmlB as string)
    const addedFields = [...b.fields.keys()].filter((k) => !a.fields.has(k))
    const removedFields = [...a.fields.keys()].filter((k) => !b.fields.has(k))
    const changedFields = [...b.fields.keys()].filter((k) => a.fields.has(k) && a.fields.get(k) !== b.fields.get(k))
    const addedObjects = [...b.objects.keys()].filter((k) => !a.objects.has(k))
    const removedObjects = [...a.objects.keys()].filter((k) => !b.objects.has(k))
    const addedMisc = [...b.misc.keys()].filter((k) => !a.misc.has(k))
    const removedMisc = [...a.misc.keys()].filter((k) => !b.misc.has(k))
    const changedMisc = [...b.misc.keys()].filter((k) => a.misc.has(k) && a.misc.get(k) !== b.misc.get(k))

    const payload = {
      status: addedFields.length + removedFields.length + changedFields.length + addedObjects.length + removedObjects.length + addedMisc.length + removedMisc.length + changedMisc.length === 0 ? 'identical' : 'differed',
      from: labelA,
      to: labelB,
      addedFields,
      removedFields,
      changedFields: changedFields.map((k) => ({field: k, before: a.fields.get(k), after: b.fields.get(k)})),
      addedObjects,
      removedObjects,
      addedMisc,
      removedMisc,
      changedMisc: changedMisc.map((k) => ({item: k, before: a.misc.get(k), after: b.misc.get(k)})),
    }
    if (asJson) {
      this.log(JSON.stringify(payload, null, 2))
    } else if (payload.status === 'identical') {
      this.log(`Identical: ${labelA} matches ${labelB}. Safe to proceed.`)
    } else {
      this.log(`Differed: +${addedFields.length} fields, -${removedFields.length} fields, ~${changedFields.length} changed, +${addedObjects.length} -${removedObjects.length} objects, +${addedMisc.length} -${removedMisc.length} ~${changedMisc.length} other.`)
      for (const c of payload.changedFields.slice(0, 10)) this.log(`  ~ ${c.field}: ${c.before} to ${c.after}`)
    }
  }
}
