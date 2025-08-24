const hre = require("hardhat");
const fs = require("fs");

function isAddress(a) { return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.trim()) }
function toBps(n, def) { const v = Number(n); return Number.isFinite(v) ? v : def }

async function addIfPresent(fund, idx) {
  const t = process.env[`ASSET${idx}_TOKEN`]
  const f = process.env[`ASSET${idx}_FEED`]
  const w = process.env[`ASSET${idx}_WEIGHT_BPS`]
  const mn = process.env[`ASSET${idx}_MIN_BPS`]
  const mx = process.env[`ASSET${idx}_MAX_BPS`]
  if (!isAddress(t) || !isAddress(f)) return false
  const weight = toBps(w, 1000)
  const minB = toBps(mn, Math.max(0, weight - 500))
  const maxB = toBps(mx, Math.min(10000, weight + 500))
  console.log(`Adding asset${idx}: token=${t}, feed=${f}, weight=${weight}, min=${minB}, max=${maxB}`)
  const tx = await fund.addAsset(t.trim(), f.trim(), weight, minB, maxB)
  await tx.wait()
  return true
}

async function main() {
  const network = hre.network.name
  const fundFile = `deployments/${network}-fund.json`
  if (!fs.existsSync(fundFile)) throw new Error("Fund not found: run create-fund first")
  const { fundAddress } = JSON.parse(fs.readFileSync(fundFile, 'utf-8'))
  const Fund = await hre.ethers.getContractFactory('ChainIndexFund')
  const fund = Fund.attach(fundAddress)

  let added = 0
  for (const i of [1,2,3,4,5]) {
    // eslint-disable-next-line no-await-in-loop
    if (await addIfPresent(fund, i)) added++
  }
  if (added === 0) console.log('No ASSET*_TOKEN/FEED provided in env; nothing added')
  else console.log(`Added ${added} asset(s)`) 
}

main().catch((e) => { console.error(e); process.exit(1) })
