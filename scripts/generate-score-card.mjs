#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

const API_BASE = 'https://api.github.com';

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

async function gh(path) {
  const headers = { 'User-Agent': 'github-social-score-card' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API failed: ${res.status} ${res.statusText} (${path})`);
  return res.json();
}

function normLog(value, max) {
  return Math.log(1 + Math.max(0, value)) / Math.log(1 + max);
}

function calculateScore(userData, reposData) {
  const repos = reposData.filter((repo) => !repo.fork);
  const n = repos.length || 1;

  const totals = repos.reduce((acc, repo) => {
    acc.stars += repo.stargazers_count;
    acc.forks += repo.forks_count;
    acc.watchers += repo.watchers_count;
    acc.issues += repo.open_issues_count;
    acc.languages.add(repo.language || 'Unknown');
    return acc;
  }, { stars: 0, forks: 0, watchers: 0, issues: 0, languages: new Set() });

  const quality = 0.65 * normLog(totals.stars, 200000) + 0.35 * normLog(totals.watchers + totals.forks, 200000);
  const influence = 0.55 * normLog(userData.followers, 1000000) + 0.45 * normLog(totals.stars + totals.forks, 250000);
  const activity = calculateActivityScore(repos);
  const consistency = calculateConsistencyScore(repos);
  const scale = normLog(n, 500);
  const diversity = normLog(totals.languages.size, 25);
  const maintenance = 1 - Math.min(1, totals.issues / Math.max(1, n * 30));

  const weighted = (
    0.2 * quality +
    0.2 * influence +
    0.16 * activity +
    0.12 * consistency +
    0.12 * scale +
    0.1 * diversity +
    0.1 * maintenance
  );

  const bonus = userData.hireable ? 0.02 : 0;
  const finalScore = Math.round(100 * Math.min(1, weighted + bonus));

  return {
    final: finalScore,
    quality: (quality * 100).toFixed(1),
    influence: (influence * 100).toFixed(1),
    activity: (activity * 100).toFixed(1),
    consistency: (consistency * 100).toFixed(1),
    scale: (scale * 100).toFixed(1),
    diversity: (diversity * 100).toFixed(1),
    maintenance: (maintenance * 100).toFixed(1),
    totalStars: totals.stars,
    followers: userData.followers,
    publicRepos: userData.public_repos,
    login: userData.login,
    languages: totals.languages.size,
  };
}

function calculateActivityScore(repos) {
  if (repos.length === 0) return 0;
  const now = Date.now();
  const lambda = 1 / (120 * 24 * 60 * 60 * 1000);
  const sum = repos.reduce((acc, repo) => acc + Math.exp(-lambda * (now - new Date(repo.pushed_at).getTime())), 0);
  return sum / repos.length;
}

function calculateConsistencyScore(repos) {
  if (repos.length < 4) return 0.5;
  const timestamps = repos.map((repo) => new Date(repo.pushed_at).getTime()).sort((a, b) => b - a);
  const gaps = [];
  for (let i = 0; i < timestamps.length - 1; i += 1) gaps.push(Math.max(1, timestamps[i] - timestamps[i + 1]));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  return 1 / (1 + cv);
}

function cardSvg(score, theme) {
  const dark = theme === 'dark';
  const bg = dark ? '#0d1117' : '#ffffff';
  const panel = dark ? '#161b22' : '#f6f8fa';
  const border = dark ? '#30363d' : '#d0d7de';
  const text = dark ? '#e6edf3' : '#24292f';
  const muted = dark ? '#8b949e' : '#57606a';
  const accent = score.final >= 80 ? '#2da44e' : score.final >= 60 ? '#1f6feb' : score.final >= 40 ? '#bf8700' : '#cf222e';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="480" height="260" viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub Social Score card">
  <rect x="0.5" y="0.5" width="479" height="259" rx="16" fill="${bg}" stroke="${border}"/>
  <text x="20" y="34" font-family="Arial, sans-serif" font-size="18" fill="${text}" font-weight="700">GitHub Social Score</text>
  <text x="20" y="54" font-family="Arial, sans-serif" font-size="12" fill="${muted}">@${score.login}</text>

  <rect x="20" y="72" width="190" height="166" rx="12" fill="${panel}" stroke="${border}"/>
  <text x="34" y="104" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Final Score</text>
  <text x="34" y="152" font-family="Arial, sans-serif" font-size="48" fill="${accent}" font-weight="700">${score.final}</text>
  <text x="34" y="180" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Followers ${score.followers} · Stars ${score.totalStars}</text>
  <text x="34" y="200" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Repos ${score.publicRepos} · Languages ${score.languages}</text>

  <rect x="222" y="72" width="238" height="166" rx="12" fill="${panel}" stroke="${border}"/>
  <text x="236" y="98" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Quality ${score.quality}</text>
  <text x="350" y="98" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Influence ${score.influence}</text>
  <text x="236" y="122" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Activity ${score.activity}</text>
  <text x="350" y="122" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Consistency ${score.consistency}</text>
  <text x="236" y="146" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Scale ${score.scale}</text>
  <text x="350" y="146" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Diversity ${score.diversity}</text>
  <text x="236" y="170" font-family="Arial, sans-serif" font-size="12" fill="${muted}">Maintenance ${score.maintenance}</text>
  <text x="236" y="204" font-family="Arial, sans-serif" font-size="11" fill="${muted}">No backend: pre-generated via GitHub Actions</text>
</svg>`;
}

const username = argValue('username') || process.env.GITHUB_USERNAME;
if (!username) throw new Error('Provide --username=<github-username> or set GITHUB_USERNAME');
const user = await gh(`/users/${username}`);
const repos = await gh(`/users/${username}/repos?per_page=100&sort=updated&direction=desc`);
const score = calculateScore(user, repos);

await writeFile('assets/social-score-light.svg', cardSvg(score, 'light'));
await writeFile('assets/social-score-dark.svg', cardSvg(score, 'dark'));
console.log(`Generated score cards for @${username} with score ${score.final}`);
