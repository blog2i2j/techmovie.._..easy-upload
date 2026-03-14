import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env ──────────────────────────────────────────────────────────────────────
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const ISSUE_BODY = process.env.ISSUE_BODY || '';
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_TITLE = process.env.ISSUE_TITLE || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO; // "owner/repo"

if (!ANTHROPIC_BASE_URL) throw new Error('Missing ANTHROPIC_BASE_URL');
if (!ANTHROPIC_AUTH_TOKEN) throw new Error('Missing ANTHROPIC_AUTH_TOKEN');
if (!GITHUB_TOKEN) throw new Error('Missing GITHUB_TOKEN');
if (!REPO) throw new Error('Missing REPO');
if (!ISSUE_NUMBER) throw new Error('Missing ISSUE_NUMBER');

// ── Parse issue body ──────────────────────────────────────────────────────────

/**
 * Extract the raw YAML block from the issue body.
 * The issue template puts it in a "Site Configuration" section wrapped in ```yaml ... ```.
 */
function extractRawYaml(body) {
  const match = body.match(/```yaml\s*([\s\S]*?)```/);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Extract the site type (NexusPHP / UNIT3D / Gazelle / Other) from the issue body.
 * GitHub issue forms render dropdown selections as plain text lines.
 */
function extractSiteType(body) {
  for (const type of ['NexusPHP', 'UNIT3D', 'Gazelle', 'Other']) {
    if (body.includes(type)) return type;
  }
  return 'Other';
}

// ── Few-shot examples ────────────────────────────────────────────────────────

const PTHOME_YAML = fs.readFileSync(
  path.join(__dirname, '../src/config/PTHome.yaml'),
  'utf8',
);
const HDHOME_YAML = fs.readFileSync(
  path.join(__dirname, '../src/config/HDHome.yaml'),
  'utf8',
);
const BLUTOPIA_YAML = fs.readFileSync(
  path.join(__dirname, '../src/config/Blutopia.yaml'),
  'utf8',
);

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at configuring the easy-upload userscript, which automates cross-tracker torrent uploading between private torrent trackers (PT sites).

Your task is to convert a raw site configuration (scraped from an upload page by the analyze-upload-page tool) into a properly formatted easy-upload YAML config file.

## Schema

The output YAML must follow the \`Site.SiteInfo\` TypeScript interface. Key fields:

- \`url\`: full site URL (e.g. https://example.com)
- \`host\`: hostname only (e.g. example.com)
- \`siteType\`: NexusPHP | UNIT3D | Gazelle | Other
- \`icon\`: leave as empty string "" — the maintainer fills this by running \`node ./scripts/icoFetcher.js <SiteName>\`
- \`asSource\`: true
- \`asTarget\`: true
- \`uploadPath\`: path from the raw config
- \`seedDomSelector\`: CSS selector for where to insert the script UI (e.g. \`'#top~table:first>tbody>tr:nth-child(3)'\`); leave as "#top~table:first>tbody>tr:nth-child(6)" if unknown and the site has a NexusPHP-style upload form, otherwise leave as empty string ""
- \`search\`: search config with \`path\`, optional \`imdbOptionKey\`/\`nameOptionKey\`, \`params\`, \`result\`
- \`name\`: { selector } — title input
- \`subtitle\`: { selector } — subtitle/aka input
- \`description\`: { selector } — description textarea
- \`imdb\`: { selector } — IMDb URL/ID input
- \`douban\`: { selector } — Douban ID input (omit if absent)
- \`anonymous\`: { selector } — anonymous upload toggle (omit if absent)
- \`torrent\`: { selector } — .torrent file input
- \`tags\`: map of tag key → CSS selector for checkbox inputs
- \`category\`: { selector, map }
- \`videoCodec\`: { selector, map } — omit selector if no dedicated dropdown
- \`audioCodec\`: { selector, map } — omit selector if no dedicated dropdown
- \`source\`: { selector, map } — physical/digital source dropdown (NexusPHP sites often have \`source_sel\`)
- \`videoType\`: { selector, map } — omit selector if no dedicated dropdown
- \`resolution\`: { selector, map } — omit selector if no dedicated dropdown
- \`area\`: { selector, map } — region/area dropdown (omit if absent)
- \`team\`: { selector, map } — encode group dropdown (omit if absent)

## Semantic key reference

**category**: movie, tv, tvPack, documentary, concert, sport, cartoon(anime), variety, music, other
**videoCodec**: h264, x264, hevc, x265, h265, mpeg2, vc1, xvid, dvd
**audioCodec**: aac, ac3, dd, dd+, flac, dts, truehd, lpcm, dtshdma, atmos, dtsx
**videoType**: bluray, remux, encode, web, hdtv, dvd, dvdrip, uhdbluray, other
**source**: uhdbluray, bluray, hdtv, dvd, web, vhs, hddvd
**resolution**: 4320p, 2160p, 1080p, 1080i, 720p, 576p, 480p
**area**: CN, US, EU, HK, TW, JP, KR, OT
**tags**: chinese_audio, cantonese_audio, chinese_subtitle, diy, hdr, hdr10_plus, dolby_vision

## Critical: intersection filtering logic

PT sites — especially NexusPHP — often combine multiple attributes into a single category dropdown.
For example, a site may have categories like: "Movies Blu-ray 1080p", "Movies Remux 2160p", "TV Encode 720p".
In these cases there are NO separate dropdowns for videoType or resolution; they are encoded in the category.

easy-upload resolves the correct category value by taking the **intersection** of the arrays
from all applicable attribute maps (category ∩ videoType ∩ resolution ∩ ...).

**How to build arrays for multi-attribute sites:**

1. In \`category.map\`, list ALL category option values that belong to each semantic type.
   e.g. \`movie\` gets every option value whose text begins with "Movie" or "Movies".

2. For \`videoType\`, \`resolution\`, \`videoCodec\`, etc.:
   - If the site HAS a dedicated dropdown for that attribute, put its option value as the **first element** of the array (this is critical — the first element is used to fill the separate dropdown).
   - Then append every category option value whose text implies that attribute.
   - Example: resolution 1080p on a site with both a resolution dropdown and mixed categories →
     \`['2', '414', '420', '429']\` where \`'2'\` is the resolution dropdown value and the rest
     are category option values whose text contains "1080p".

3. If the site does NOT have a dedicated dropdown for that attribute, omit the \`selector\`
   key entirely and only provide a \`map\` with the relevant category option values.

4. The intersection logic finds which single category value appears in ALL relevant maps,
   giving the precise category option to select.

**Identifying mixed-attribute categories:**
- Option texts like "Movies Remux 1080p", "TV Encode 720p", "Documentaries Blu-ray 4K"
  are clear signals that the category mixes type + resolution (and possibly more).
- In such cases, omit \`selector\` from \`videoType\` and \`resolution\` and build their maps
  from the category option values.

## General mapping rules

1. Read each option's \`text\` carefully to identify its semantic meaning.
2. The option's \`value\` is what goes into the map.
3. An option matching multiple semantics (e.g. "H.264 / x264") → include under both keys.
4. If you cannot confidently map an option, add a \`# TODO:\` YAML comment on that line.
5. Only include top-level fields that are present in the raw config.
6. Selectors come directly from the raw config.

## Few-shot examples

### Example 1: NexusPHP site with separate dropdowns for each attribute (PTHome)

\`\`\`yaml
${PTHOME_YAML}\`\`\`

### Example 2: NexusPHP site with mixed-attribute categories requiring intersection (HDHome)

\`\`\`yaml
${HDHOME_YAML}\`\`\`

### Example 3: UNIT3D site (Blutopia)

\`\`\`yaml
${BLUTOPIA_YAML}\`\`\`

## Output format

Respond with ONLY the final YAML — no explanation, no markdown fences, no commentary outside the YAML.
The first line of your response must be \`url:\`.`;

// ── Claude API call ──────────────────────────────────────────────────────────

async function generateConfig(rawYaml, siteType) {
  const client = new Anthropic({
    authToken: ANTHROPIC_AUTH_TOKEN,
    baseURL: ANTHROPIC_BASE_URL,
  });

  const userMessage = `Convert this raw site config to easy-upload format.

Site type: ${siteType}

Raw config:
${rawYaml}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0].text.trim();
}

// ── GitHub API helpers ───────────────────────────────────────────────────────

const GH_API = 'https://api.github.com';
const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function ghFetch(path, options = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: { ...GH_HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function postComment(body) {
  await ghFetch(`/repos/${REPO}/issues/${ISSUE_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function getDefaultBranch() {
  const repo = await ghFetch(`/repos/${REPO}`);
  return repo.default_branch;
}

async function getBranchSha(branch) {
  const ref = await ghFetch(
    `/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  return ref.object.sha;
}

async function createBranch(branchName, sha) {
  await ghFetch(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });
}

async function createFile(branchName, filePath, content, commitMessage) {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  await ghFetch(`/repos/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content: encoded,
      branch: branchName,
    }),
  });
}

async function createDraftPR(branchName, defaultBranch, title, body) {
  return ghFetch(`/repos/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: defaultBranch,
      draft: true,
    }),
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Parse issue
  const rawYaml = extractRawYaml(ISSUE_BODY);
  if (!rawYaml) {
    await postComment(
      '> [!WARNING]\n> Could not find a YAML code block in the issue body. ' +
        'Please paste the output of the **[EASY-UPLOAD] Retrieve Site Config** button ' +
        'inside a ` ```yaml ``` ` block under the "Site Configuration" section.',
    );
    process.exit(0);
  }

  const siteType = extractSiteType(ISSUE_BODY);
  console.log(`Detected site type: ${siteType}`);
  console.log(`Raw YAML length: ${rawYaml.length} chars`);

  // 2. Call Claude
  let generatedYaml;
  try {
    generatedYaml = await generateConfig(rawYaml, siteType);
  } catch (err) {
    await postComment(
      `> [!ERROR]\n> Failed to call Claude API: ${err.message}\n\nPlease ask the maintainer to run the generation manually.`,
    );
    throw err;
  }

  // 3. Extract host from generated YAML for branch/file naming
  let host;
  try {
    const parsed = yaml.load(generatedYaml);
    host = parsed.host;
    if (!host) throw new Error('No host field in generated YAML');
  } catch (err) {
    await postComment(
      `> [!WARNING]\n> Claude returned YAML that could not be parsed: ${err.message}\n\nHere is the raw output for manual review:\n\n\`\`\`yaml\n${generatedYaml}\n\`\`\``,
    );
    process.exit(0);
  }

  // Sanitize hostname for use in branch names and filenames
  const safeName = host.replace(/[^a-zA-Z0-9._-]/g, '-');
  const branchName = `feat/new-site-${safeName}`;
  const configFileName = `${safeName}.yaml`;
  const configFilePath = `src/config/${configFileName}`;

  // 4. Post comment with generated YAML
  const issueComment =
    `## Generated Site Config\n\n` +
    `Claude has generated the following \`${configFilePath}\` based on the raw config in this issue.\n\n` +
    `**Please review the mappings carefully** — especially the \`category\`, \`videoType\`, \`videoCodec\`, \`audioCodec\`, and \`resolution\` maps.\n\n` +
    `\`\`\`yaml\n${generatedYaml}\n\`\`\`\n\n` +
    `A draft PR has been / will be created with this file. Edit it directly on the branch if corrections are needed.`;

  await postComment(issueComment);
  console.log('Posted comment with generated YAML');

  // 5. Create branch + file + draft PR
  const defaultBranch = await getDefaultBranch();
  const sha = await getBranchSha(defaultBranch);

  try {
    await createBranch(branchName, sha);
    console.log(`Created branch: ${branchName}`);
  } catch (err) {
    // Branch may already exist if the action ran twice
    if (!err.message.includes('422')) throw err;
    console.log(`Branch ${branchName} already exists, skipping creation`);
  }

  const commitMessage =
    `feat(config): add ${safeName} site config\n\n` +
    `Auto-generated from issue #${ISSUE_NUMBER} via Claude API.\n` +
    `Closes #${ISSUE_NUMBER}`;

  await createFile(branchName, configFilePath, generatedYaml, commitMessage);
  console.log(`Committed ${configFilePath}`);

  const prBody =
    `## New site: ${host}\n\n` +
    `Auto-generated from issue #${ISSUE_NUMBER}.\n\n` +
    `### Review checklist\n` +
    `- [ ] \`category\` map is correct\n` +
    `- [ ] \`videoType\` map is correct\n` +
    `- [ ] \`videoCodec\` map is correct\n` +
    `- [ ] \`audioCodec\` map is correct\n` +
    `- [ ] \`resolution\` map is correct\n` +
    `- [ ] \`selector\` values point to the correct form fields\n` +
    `- [ ] \`icon\` has been filled in\n` +
    `- [ ] Tested on the actual site\n\n` +
    `Closes #${ISSUE_NUMBER}`;

  const issueLabel = ISSUE_TITLE
    ? ISSUE_TITLE.replace(/^\[.*?\]\s*/, '').trim()
    : host;
  const pr = await createDraftPR(
    branchName,
    defaultBranch,
    `feat(config): add ${issueLabel} (${host}) site config`,
    prBody,
  );
  console.log(`Created draft PR: ${pr.html_url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
