import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSpiritWithRatings, getSpiritsForUsers, fetchAppUsers,
  addAppUser, deleteAppUser, updateUserProfiles, generateAndSaveTasteSummary
} from './supabase'

const MASTER_API_KEY = import.meta.env.VITE_GROK_API_KEY || ''
const VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY || ''

const GROK_PERSONALITY = `You are a world-class spirits expert and bartender with a fun, sassy, opinionated personality. You know everything about whiskey, bourbon, scotch, tequila, mezcal, rum, gin, vodka, and all other spirits. You are confident, use light humor, and are not afraid to be dramatic about bad choices. Think knowledgeable best friend at a bar, not stuffy sommelier. Keep it fun but always back up your opinions with real spirits knowledge.`

interface AppUser {
  id: string
  name: string
  grok_api_key?: string
  is_admin?: boolean
  taste_profile?: string
  taste_summary?: string
}

interface ScannedImage {
  id: string
  dataUrl: string
  mode: 'menu' | 'bar'
}

interface Recommendation {
  spirit_name: string
  distillery?: string
  age_statement?: string
  price?: number
  retail_price?: number
  similarity_score: number
  why_it_matches: string
  similar_to?: string
  tasting_notes: string
  potential_drawbacks?: string
}

interface WorstPick {
  spirit_name: string
  distillery?: string
  price?: number
  why_its_bad: string
}

interface NewSpirit {
  name: string
  distillery: string
  spirit_type: string
  whiskey_style: string
  age_statement: string
  abv: string
  country: string
  region: string
  flavor_profile: string
  nose_notes: string
  palate_notes: string
  finish_notes: string
  tasting_notes: string
}

interface UserRating {
  user_name: string
  rating: string
  value_rating: string
  price: string
  how_consumed: string
  notes: string
}

type Screen = 'startup' | 'home' | 'scan' | 'quiz' | 'results' | 'addSpirit' | 'addSpiritForm' | 'rateSpirit' | 'admin'
type ScanMode = 'menu' | 'bar' | null

const SPIRIT_TYPES = [
  { id: 'whiskey', label: '🥃 Whiskey', emoji: '🥃' },
  { id: 'bourbon', label: '🌽 Bourbon', emoji: '🌽' },
  { id: 'scotch', label: '🏔️ Scotch', emoji: '🏔️' },
  { id: 'irish', label: '☘️ Irish Whiskey', emoji: '☘️' },
  { id: 'japanese', label: '🎌 Japanese Whisky', emoji: '🎌' },
  { id: 'rye', label: '🌾 Rye Whiskey', emoji: '🌾' },
  { id: 'tequila', label: '🌵 Tequila', emoji: '🌵' },
  { id: 'mezcal', label: '🔥 Mezcal', emoji: '🔥' },
  { id: 'agave', label: '🌿 Other Agave', emoji: '🌿' },
  { id: 'rum', label: '🍹 Rum', emoji: '🍹' },
  { id: 'gin', label: '🌲 Gin', emoji: '🌲' },
  { id: 'vodka', label: '🧊 Vodka', emoji: '🧊' },
  { id: 'brandy', label: '🍇 Brandy & Cognac', emoji: '🍇' },
  { id: 'liqueur', label: '🍑 Liqueurs & Digestifs', emoji: '🍑' },
  { id: 'surprise', label: '🎲 Surprise Me!', emoji: '🎲' },
]

const WHISKEY_STYLES = ['Single Malt', 'Blended', 'Bourbon', 'Rye', 'Irish', 'Japanese', 'Tennessee', 'Canadian', 'Other']
const FLAVOR_PROFILES = ['🍯 Sweet & Vanilla', '🍎 Fruity & Floral', '🌶️ Spicy & Peppery', '🌫️ Smoky & Peaty', '🪵 Rich & Oaky', '🌰 Nutty & Dry', '🍫 Dark Chocolate & Rich', '🍋 Light & Citrusy']
const BODY_OPTIONS = ['Light', 'Medium', 'Full & Bold']
const FINISH_OPTIONS = ['Short & Clean', 'Medium', 'Long & Warming']
const AGE_OPTIONS = ['Young & Vibrant (under 12yr)', 'Mature (12-18yr)', 'Well Aged (18yr+)', 'No Preference']
const PEAT_OPTIONS = ['No Peat — Keep it clean', 'A little smoke', 'Heavily Peated — Bring it on']
const SERVING_OPTIONS = ['Neat', 'On the Rocks', 'With a splash of water', 'Cocktail']
const TEQUILA_STYLES = ['Blanco', 'Reposado', 'Añejo', 'Extra Añejo', 'No Preference']
const RUM_STYLES = ['White / Light', 'Gold / Aged', 'Dark & Rich', 'Spiced', 'Agricole / Rhum']
const GIN_STYLES = ['Classic London Dry', 'Contemporary / Floral', 'Navy Strength', 'Old Tom', 'No Preference']
const COUNTRIES = ['USA', 'Scotland', 'Ireland', 'Japan', 'Canada', 'Mexico', 'Caribbean', 'France', 'Other']
const RATINGS = ['Amazing', 'Good', 'Fine', 'Bad']
const VALUE_RATINGS = ['Great Value', 'Fairly Priced', 'Overrated']
const PEAT_ELIGIBLE = ['scotch', 'irish', 'japanese', 'whiskey']

function compressImage(dataUrl: string, maxWidth = 500, quality = 0.35): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

async function extractTextWithVision(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('No base64 data in image')
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }] }]
      })
    }
  )
  const data = await response.json()
  const visionError = data.error || data.responses?.[0]?.error
  if (visionError) throw new Error('Vision: ' + visionError.code + ' ' + visionError.message)
  return data.responses?.[0]?.fullTextAnnotation?.text || ''
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup')
  const [users, setUsers] = useState<AppUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [scannedImages, setScannedImages] = useState<ScannedImage[]>([])

  const [spiritType, setSpiritType] = useState('')
  const [whiskeyStyle, setWhiskeyStyle] = useState('')
  const [flavorProfile, setFlavorProfile] = useState('')
  const [body, setBody] = useState('')
  const [finish, setFinish] = useState('')
  const [agePreference, setAgePreference] = useState('')
  const [peatPreference, setPeatPreference] = useState('')
  const [serving, setServing] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [adventure, setAdventure] = useState('')
  const [subStyle, setSubStyle] = useState('')
  const [quizStep, setQuizStep] = useState(0)

  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [worstPick, setWorstPick] = useState<WorstPick | null>(null)
  const [extractedSpirits, setExtractedSpirits] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [showExtracted, setShowExtracted] = useState(false)
  const [priceFilter, setPriceFilter] = useState<{ min: number; max: number } | null>(null)

  const [newSpirit, setNewSpirit] = useState<NewSpirit>({
    name: '', distillery: '', spirit_type: '', whiskey_style: '', age_statement: '',
    abv: '', country: '', region: '', flavor_profile: '', nose_notes: '',
    palate_notes: '', finish_notes: '', tasting_notes: ''
  })
  const [userRatings, setUserRatings] = useState<UserRating[]>([])
  const [ratingUserIndex, setRatingUserIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isParsingLabel, setIsParsingLabel] = useState(false)

  const [newUserName, setNewUserName] = useState('')
  const [newUserKey, setNewUserKey] = useState('')
  const [newUserProfile, setNewUserProfile] = useState('')
  const [logoTapCount, setLogoTapCount] = useState(0)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingProfile, setEditingProfile] = useState<{ id: string; text: string } | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setUsersLoading(true)
    const data = await fetchAppUsers()
    setUsers(data)
    setUsersLoading(false)
  }

  const getApiKey = () => {
    const selected = users.filter(u => selectedUsers.includes(u.id))
    for (const user of selected) { if (user.grok_api_key) return user.grok_api_key }
    return MASTER_API_KEY
  }

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, mode: ScanMode) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        // Bar photos need higher quality to read bottle labels
        const compressed = mode === 'bar'
          ? await compressImage(reader.result as string, 1200, 0.7)
          : await compressImage(reader.result as string)
        setScannedImages(prev => [...prev, { id: uuidv4(), dataUrl: compressed, mode: mode! }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleLabelFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsParsingLabel(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const compressed = await compressImage(reader.result as string)
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
          body: JSON.stringify({
            model: 'grok-4.3',
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: compressed, detail: 'high' } },
              { type: 'text', text: 'You are a spirits expert. Analyze this bottle label and extract details. Return ONLY valid JSON:\n{"name":"full spirit name","distillery":"distillery","spirit_type":"whiskey/bourbon/scotch/tequila/rum/gin/vodka/brandy/liqueur","whiskey_style":"Single Malt/Blended/Bourbon/Rye/Irish/Japanese/Tennessee/Canadian or null","age_statement":"e.g. 12 Year Old or null","abv":"e.g. 40 or null","country":"country","region":"region or null","tasting_notes":"any notes from label or null"}' }
            ]}],
            max_tokens: 500
          })
        })
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
        setNewSpirit(prev => ({
          ...prev,
          name: parsed.name || prev.name,
          distillery: parsed.distillery || prev.distillery,
          spirit_type: parsed.spirit_type || prev.spirit_type,
          whiskey_style: parsed.whiskey_style || prev.whiskey_style,
          age_statement: parsed.age_statement || prev.age_statement,
          abv: parsed.abv || prev.abv,
          country: parsed.country || prev.country,
          region: parsed.region || prev.region,
          tasting_notes: parsed.tasting_notes || prev.tasting_notes,
        }))
        setScreen('addSpiritForm')
      } catch (err) {
        console.error(err)
        alert('Could not read label. Please fill in manually.')
        setScreen('addSpiritForm')
      } finally {
        setIsParsingLabel(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const startAddSpirit = () => {
    setNewSpirit({ name: '', distillery: '', spirit_type: '', whiskey_style: '', age_statement: '', abv: '', country: '', region: '', flavor_profile: '', nose_notes: '', palate_notes: '', finish_notes: '', tasting_notes: '' })
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    setUserRatings(names.map(name => ({ user_name: name, rating: '', value_rating: '', price: '', how_consumed: '', notes: '' })))
    setRatingUserIndex(0)
    setScreen('addSpirit')
  }

  const updateRating = (field: keyof UserRating, value: string) => {
    setUserRatings(prev => prev.map((r, i) => i === ratingUserIndex ? { ...r, [field]: value } : r))
  }

  const goToNextRating = async () => {
    if (ratingUserIndex < userRatings.length - 1) { setRatingUserIndex(i => i + 1) }
    else { await handleSaveSpirit() }
  }

  const handleSaveSpirit = async () => {
    if (!newSpirit.name.trim()) { alert('Please enter at least the spirit name'); return }
    setIsSaving(true)
    try {
      const spiritToSave = { ...newSpirit, abv: newSpirit.abv ? parseFloat(newSpirit.abv) : undefined }
      const ratingsToSave = userRatings.map(r => ({
        user_name: r.user_name,
        rating: r.rating || undefined,
        value_rating: r.value_rating || undefined,
        price: r.price ? parseFloat(r.price) : undefined,
        how_consumed: r.how_consumed || undefined,
        notes: r.notes || undefined,
      }))
      const result = await saveSpiritWithRatings(spiritToSave, ratingsToSave)
      if (result.success) { alert('Spirit saved! 🥃'); setScreen('home') }
      else { alert('Error saving. Please try again.') }
    } catch (err) {
      console.error(err); alert('Error saving. Please try again.')
    } finally { setIsSaving(false) }
  }

  const handleAddUser = async () => {
    if (!newUserName.trim()) { alert('Please enter a name'); return }
    setIsAddingUser(true)
    const result = await addAppUser(newUserName.trim(), newUserKey.trim() || undefined, newUserProfile.trim() || undefined)
    if (result) { await loadUsers(); setNewUserName(''); setNewUserKey(''); setNewUserProfile(''); alert(newUserName + ' added!') }
    else { alert('Error adding user.') }
    setIsAddingUser(false)
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm('Remove ' + name + '?')) return
    await deleteAppUser(id); await loadUsers()
  }

  const handleSaveProfile = async (userId: string, profileText: string) => {
    await updateUserProfiles(userId, profileText); await loadUsers(); setEditingProfile(null)
  }

  const handleGenerateSummary = async (user: AppUser) => {
    setIsGeneratingSummary(user.id)
    try {
      const allSpirits = await getSpiritsForUsers([user.name])
      if (allSpirits.length === 0) { alert('No spirits history yet for ' + user.name + '. Add some first!'); return }
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + MASTER_API_KEY },
        body: JSON.stringify({
          model: 'grok-4.3',
          messages: [{ role: 'user', content: GROK_PERSONALITY + '\n\nBased on this person\'s spirits history, write a SHORT 2-3 sentence taste profile summary. Be specific about what styles, flavors, and spirits they love and avoid. Make it fun and personal.\n\nSpirits history:\n' + JSON.stringify(allSpirits) + '\n\nReturn ONLY the summary paragraph, no other text.' }],
          max_tokens: 300
        })
      })
      const data = await response.json()
      const summary = data.choices?.[0]?.message?.content || ''
      if (summary) { await generateAndSaveTasteSummary(user.id, summary); await loadUsers(); alert('Taste summary generated for ' + user.name + '!') }
    } catch (err) { console.error(err); alert('Error generating summary.') }
    finally { setIsGeneratingSummary(null) }
  }

  const handleLogoTap = () => {
    const newCount = logoTapCount + 1
    setLogoTapCount(newCount)
    if (newCount >= 3) { setLogoTapCount(0); setScreen('admin') }
  }

  const resetQuiz = () => {
    setQuizStep(0); setSpiritType(''); setWhiskeyStyle(''); setFlavorProfile('')
    setBody(''); setFinish(''); setAgePreference(''); setPeatPreference('')
    setServing(''); setPriceMin(''); setPriceMax(''); setAdventure(''); setSubStyle('')
  }

  const buildQuizSteps = () => {
    const steps: { title: string; content: React.ReactNode }[] = []

    steps.push({
      title: 'What are you in the mood for?',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {SPIRIT_TYPES.map(st => (
            <button key={st.id} onClick={() => setSpiritType(st.id)}
              style={{ padding: '14px', borderRadius: '14px', border: '2px solid', cursor: 'pointer', background: spiritType === st.id ? '#92400E' : '#2A1F17', borderColor: spiritType === st.id ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>
              {st.label}
            </button>
          ))}
        </div>
      )
    })

    steps.push({
      title: 'Are you feeling adventurous?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {['🏠 Something familiar — classic styles I know I like', '🗺️ A bit far afield — interesting but not too out there', '🌍 Very unique — surprise me with something rare'].map(opt =>
            optionBtn(opt, opt, adventure, setAdventure)
          )}
        </div>
      )
    })

    if (['whiskey', 'scotch', 'irish', 'japanese', 'rye', 'bourbon'].includes(spiritType)) {
      steps.push({ title: 'What style of whiskey?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>{WHISKEY_STYLES.map(s => optionBtn(s, s, whiskeyStyle, setWhiskeyStyle))}</div>) })
      steps.push({ title: 'What flavor profile calls to you?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{FLAVOR_PROFILES.map(f => optionBtn(f, f, flavorProfile, setFlavorProfile))}</div>) })
      steps.push({ title: 'How full-bodied?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[...BODY_OPTIONS, 'No Preference'].map(b => optionBtn(b, b, body, setBody))}</div>) })
      steps.push({ title: 'Finish preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[...FINISH_OPTIONS, 'No Preference'].map(f => optionBtn(f, f, finish, setFinish))}</div>) })
      steps.push({ title: 'Age preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{AGE_OPTIONS.map(a => optionBtn(a, a, agePreference, setAgePreference))}</div>) })
      if (PEAT_ELIGIBLE.includes(spiritType) || ['Single Malt', 'Blended', 'Irish', 'Japanese', 'Other'].includes(whiskeyStyle)) {
        steps.push({ title: 'Peat & smoke preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{PEAT_OPTIONS.map(p => optionBtn(p, p, peatPreference, setPeatPreference))}</div>) })
      }
      steps.push({ title: 'How are you drinking it tonight?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{SERVING_OPTIONS.map(sv => optionBtn(sv, sv, serving, setServing))}</div>) })
    }

    if (spiritType === 'tequila') {
      steps.push({ title: 'Tequila style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{TEQUILA_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
      steps.push({ title: 'How are you drinking it?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Sipping neat', 'On the rocks', 'Cocktail (margarita etc)', 'No preference'].map(s => optionBtn(s, s, serving, setServing))}</div>) })
    }

    if (spiritType === 'mezcal') {
      steps.push({ title: 'Smoke level?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Light smoke', 'Medium smoke', 'Heavy smoke — the smokier the better', 'No preference'].map(s => optionBtn(s, s, peatPreference, setPeatPreference))}</div>) })
    }

    if (spiritType === 'rum') {
      steps.push({ title: 'Rum style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{RUM_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
    }

    if (spiritType === 'gin') {
      steps.push({ title: 'Gin style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{GIN_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
    }

    steps.push({
      title: 'Price range per pour?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Min ($)</label>
              <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="0" style={s.input} />
            </div>
            <span style={{ color: '#FCD34D', paddingBottom: '14px' }}>—</span>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Max ($)</label>
              <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="50" style={s.input} />
            </div>
          </div>
          <button onClick={() => { setPriceMin(''); setPriceMax('') }}
            style={{ background: '#2A1F17', border: '1px solid #78350F', borderRadius: '14px', padding: '14px', color: 'white', cursor: 'pointer' }}>
            No Price Preference
          </button>
        </div>
      )
    })

    return steps
  }

  const callGrok = async () => {
    if (scannedImages.length === 0) { alert('Please scan or upload a menu or bar photo first!'); return }
    setIsLoading(true); setRecommendations([]); setWorstPick(null); setScreen('results')

    const selectedUserNamesList = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    const selectedUserNames = selectedUserNamesList.join(', ')
    const allSpirits = await getSpiritsForUsers(selectedUserNamesList)

    const selectedUserObjects = users.filter(u => selectedUsers.includes(u.id))
    const userContext = selectedUserObjects.map(u => {
      const parts = ['User: ' + u.name]
      if (u.taste_profile) parts.push('Their own description: "' + u.taste_profile + '"')
      if (u.taste_summary) parts.push('AI taste summary: "' + u.taste_summary + '"')
      return parts.join('\n')
    }).join('\n\n')

    const spiritLabel = SPIRIT_TYPES.find(st => st.id === spiritType)?.label || spiritType
    const preferences = [
      'Spirit type: ' + (spiritLabel || 'no preference'),
      whiskeyStyle ? 'Whiskey style: ' + whiskeyStyle : '',
      subStyle ? 'Style: ' + subStyle : '',
      flavorProfile ? 'Flavor profile: ' + flavorProfile : '',
      body ? 'Body: ' + body : '',
      finish ? 'Finish: ' + finish : '',
      agePreference ? 'Age: ' + agePreference : '',
      peatPreference ? 'Peat/smoke: ' + peatPreference : '',
      serving ? 'Serving: ' + serving : '',
      adventure ? 'Adventurousness: ' + adventure : '',
      priceMin && priceMax ? 'Price range: $' + priceMin + '-$' + priceMax : '',
    ].filter(Boolean).join(', ')

    const spiritsHistory = allSpirits.length > 0 ? 'Past spirits ratings:\n' + JSON.stringify(allSpirits) : 'No past spirits history — rely on stated preferences.'
    const menuImages = scannedImages.filter(i => i.mode === 'menu')
    const barImages = scannedImages.filter(i => i.mode === 'bar')

    try {
      let fullSpiritsList = ''

      if (menuImages.length > 0) {
        setOcrStatus('Reading spirits menu with Google Vision...')
        const ocrTexts: string[] = []
        for (let i = 0; i < menuImages.length; i++) {
          setOcrStatus('Reading page ' + (i + 1) + ' of ' + menuImages.length + '...')
          const text = await extractTextWithVision(menuImages[i].dataUrl)
          if (text) ocrTexts.push(text)
        }
        fullSpiritsList += ocrTexts.join('\n\n--- NEXT PAGE ---\n\n')
      }

      if (barImages.length > 0) {
        setOcrStatus('Identifying bottles from bar photos...')
        const barResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
          body: JSON.stringify({
            model: 'grok-4.3',
            messages: [{ role: 'user', content: [...barImages.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })), { type: 'text', text: 'You are an expert spirits identifier. STRICT RULES: (1) Only identify a bottle if you can read the brand name AND at least one other detail (distillery, age, or expression) with 100% confidence. (2) If you are even slightly unsure about a bottle — SKIP IT. Do not guess, do not infer, do not hallucinate. (3) It is ALWAYS better to return 2 correct bottles than 5 where 3 are wrong. Return ONLY a JSON array of bottles you are completely certain about:
[{"name":"exact brand name as written","distillery":"distillery","style":"bourbon/scotch/tequila etc","age":"age statement or null","visible_price":null}]
If you are not 100% certain about ANY bottle, return: []'mport React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSpiritWithRatings, getSpiritsForUsers, fetchAppUsers,
  addAppUser, deleteAppUser, updateUserProfiles, generateAndSaveTasteSummary
} from './supabase'

const MASTER_API_KEY = import.meta.env.VITE_GROK_API_KEY || ''
const VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY || ''

const GROK_PERSONALITY = `You are a world-class spirits expert and bartender with a fun, sassy, opinionated personality. You know everything about whiskey, bourbon, scotch, tequila, mezcal, rum, gin, vodka, and all other spirits. You are confident, use light humor, and are not afraid to be dramatic about bad choices. Think knowledgeable best friend at a bar, not stuffy sommelier. Keep it fun but always back up your opinions with real spirits knowledge.`

interface AppUser {
  id: string
  name: string
  grok_api_key?: string
  is_admin?: boolean
  taste_profile?: string
  taste_summary?: string
}

interface ScannedImage {
  id: string
  dataUrl: string
  mode: 'menu' | 'bar'
}

interface Recommendation {
  spirit_name: string
  distillery?: string
  age_statement?: string
  price?: number
  retail_price?: number
  similarity_score: number
  why_it_matches: string
  similar_to?: string
  tasting_notes: string
  potential_drawbacks?: string
}

interface WorstPick {
  spirit_name: string
  distillery?: string
  price?: number
  why_its_bad: string
}

interface NewSpirit {
  name: string
  distillery: string
  spirit_type: string
  whiskey_style: string
  age_statement: string
  abv: string
  country: string
  region: string
  flavor_profile: string
  nose_notes: string
  palate_notes: string
  finish_notes: string
  tasting_notes: string
}

interface UserRating {
  user_name: string
  rating: string
  value_rating: string
  price: string
  how_consumed: string
  notes: string
}

type Screen = 'startup' | 'home' | 'scan' | 'quiz' | 'results' | 'addSpirit' | 'addSpiritForm' | 'rateSpirit' | 'admin'
type ScanMode = 'menu' | 'bar' | null

const SPIRIT_TYPES = [
  { id: 'whiskey', label: '🥃 Whiskey', emoji: '🥃' },
  { id: 'bourbon', label: '🌽 Bourbon', emoji: '🌽' },
  { id: 'scotch', label: '🏔️ Scotch', emoji: '🏔️' },
  { id: 'irish', label: '☘️ Irish Whiskey', emoji: '☘️' },
  { id: 'japanese', label: '🎌 Japanese Whisky', emoji: '🎌' },
  { id: 'rye', label: '🌾 Rye Whiskey', emoji: '🌾' },
  { id: 'tequila', label: '🌵 Tequila', emoji: '🌵' },
  { id: 'mezcal', label: '🔥 Mezcal', emoji: '🔥' },
  { id: 'agave', label: '🌿 Other Agave', emoji: '🌿' },
  { id: 'rum', label: '🍹 Rum', emoji: '🍹' },
  { id: 'gin', label: '🌲 Gin', emoji: '🌲' },
  { id: 'vodka', label: '🧊 Vodka', emoji: '🧊' },
  { id: 'brandy', label: '🍇 Brandy & Cognac', emoji: '🍇' },
  { id: 'liqueur', label: '🍑 Liqueurs & Digestifs', emoji: '🍑' },
  { id: 'surprise', label: '🎲 Surprise Me!', emoji: '🎲' },
]

const WHISKEY_STYLES = ['Single Malt', 'Blended', 'Bourbon', 'Rye', 'Irish', 'Japanese', 'Tennessee', 'Canadian', 'Other']
const FLAVOR_PROFILES = ['🍯 Sweet & Vanilla', '🍎 Fruity & Floral', '🌶️ Spicy & Peppery', '🌫️ Smoky & Peaty', '🪵 Rich & Oaky', '🌰 Nutty & Dry', '🍫 Dark Chocolate & Rich', '🍋 Light & Citrusy']
const BODY_OPTIONS = ['Light', 'Medium', 'Full & Bold']
const FINISH_OPTIONS = ['Short & Clean', 'Medium', 'Long & Warming']
const AGE_OPTIONS = ['Young & Vibrant (under 12yr)', 'Mature (12-18yr)', 'Well Aged (18yr+)', 'No Preference']
const PEAT_OPTIONS = ['No Peat — Keep it clean', 'A little smoke', 'Heavily Peated — Bring it on']
const SERVING_OPTIONS = ['Neat', 'On the Rocks', 'With a splash of water', 'Cocktail']
const TEQUILA_STYLES = ['Blanco', 'Reposado', 'Añejo', 'Extra Añejo', 'No Preference']
const RUM_STYLES = ['White / Light', 'Gold / Aged', 'Dark & Rich', 'Spiced', 'Agricole / Rhum']
const GIN_STYLES = ['Classic London Dry', 'Contemporary / Floral', 'Navy Strength', 'Old Tom', 'No Preference']
const COUNTRIES = ['USA', 'Scotland', 'Ireland', 'Japan', 'Canada', 'Mexico', 'Caribbean', 'France', 'Other']
const RATINGS = ['Amazing', 'Good', 'Fine', 'Bad']
const VALUE_RATINGS = ['Great Value', 'Fairly Priced', 'Overrated']
const PEAT_ELIGIBLE = ['scotch', 'irish', 'japanese', 'whiskey']

function compressImage(dataUrl: string, maxWidth = 500, quality = 0.35): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

async function extractTextWithVision(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('No base64 data in image')
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }] }]
      })
    }
  )
  const data = await response.json()
  const visionError = data.error || data.responses?.[0]?.error
  if (visionError) throw new Error('Vision: ' + visionError.code + ' ' + visionError.message)
  return data.responses?.[0]?.fullTextAnnotation?.text || ''
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('startup')
  const [users, setUsers] = useState<AppUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [scannedImages, setScannedImages] = useState<ScannedImage[]>([])

  const [spiritType, setSpiritType] = useState('')
  const [whiskeyStyle, setWhiskeyStyle] = useState('')
  const [flavorProfile, setFlavorProfile] = useState('')
  const [body, setBody] = useState('')
  const [finish, setFinish] = useState('')
  const [agePreference, setAgePreference] = useState('')
  const [peatPreference, setPeatPreference] = useState('')
  const [serving, setServing] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [adventure, setAdventure] = useState('')
  const [subStyle, setSubStyle] = useState('')
  const [quizStep, setQuizStep] = useState(0)

  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [worstPick, setWorstPick] = useState<WorstPick | null>(null)
  const [extractedSpirits, setExtractedSpirits] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [showExtracted, setShowExtracted] = useState(false)
  const [priceFilter, setPriceFilter] = useState<{ min: number; max: number } | null>(null)

  const [newSpirit, setNewSpirit] = useState<NewSpirit>({
    name: '', distillery: '', spirit_type: '', whiskey_style: '', age_statement: '',
    abv: '', country: '', region: '', flavor_profile: '', nose_notes: '',
    palate_notes: '', finish_notes: '', tasting_notes: ''
  })
  const [userRatings, setUserRatings] = useState<UserRating[]>([])
  const [ratingUserIndex, setRatingUserIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isParsingLabel, setIsParsingLabel] = useState(false)

  const [newUserName, setNewUserName] = useState('')
  const [newUserKey, setNewUserKey] = useState('')
  const [newUserProfile, setNewUserProfile] = useState('')
  const [logoTapCount, setLogoTapCount] = useState(0)
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [editingProfile, setEditingProfile] = useState<{ id: string; text: string } | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setUsersLoading(true)
    const data = await fetchAppUsers()
    setUsers(data)
    setUsersLoading(false)
  }

  const getApiKey = () => {
    const selected = users.filter(u => selectedUsers.includes(u.id))
    for (const user of selected) { if (user.grok_api_key) return user.grok_api_key }
    return MASTER_API_KEY
  }

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id])
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, mode: ScanMode) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        // Bar photos need higher quality to read bottle labels
        const compressed = mode === 'bar'
          ? await compressImage(reader.result as string, 1200, 0.7)
          : await compressImage(reader.result as string)
        setScannedImages(prev => [...prev, { id: uuidv4(), dataUrl: compressed, mode: mode! }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleLabelFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsParsingLabel(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const compressed = await compressImage(reader.result as string)
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
          body: JSON.stringify({
            model: 'grok-4.3',
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: compressed, detail: 'high' } },
              { type: 'text', text: 'You are a spirits expert. Analyze this bottle label and extract details. Return ONLY valid JSON:\n{"name":"full spirit name","distillery":"distillery","spirit_type":"whiskey/bourbon/scotch/tequila/rum/gin/vodka/brandy/liqueur","whiskey_style":"Single Malt/Blended/Bourbon/Rye/Irish/Japanese/Tennessee/Canadian or null","age_statement":"e.g. 12 Year Old or null","abv":"e.g. 40 or null","country":"country","region":"region or null","tasting_notes":"any notes from label or null"}' }
            ]}],
            max_tokens: 500
          })
        })
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || '{}'
        const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
        setNewSpirit(prev => ({
          ...prev,
          name: parsed.name || prev.name,
          distillery: parsed.distillery || prev.distillery,
          spirit_type: parsed.spirit_type || prev.spirit_type,
          whiskey_style: parsed.whiskey_style || prev.whiskey_style,
          age_statement: parsed.age_statement || prev.age_statement,
          abv: parsed.abv || prev.abv,
          country: parsed.country || prev.country,
          region: parsed.region || prev.region,
          tasting_notes: parsed.tasting_notes || prev.tasting_notes,
        }))
        setScreen('addSpiritForm')
      } catch (err) {
        console.error(err)
        alert('Could not read label. Please fill in manually.')
        setScreen('addSpiritForm')
      } finally {
        setIsParsingLabel(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const startAddSpirit = () => {
    setNewSpirit({ name: '', distillery: '', spirit_type: '', whiskey_style: '', age_statement: '', abv: '', country: '', region: '', flavor_profile: '', nose_notes: '', palate_notes: '', finish_notes: '', tasting_notes: '' })
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    setUserRatings(names.map(name => ({ user_name: name, rating: '', value_rating: '', price: '', how_consumed: '', notes: '' })))
    setRatingUserIndex(0)
    setScreen('addSpirit')
  }

  const updateRating = (field: keyof UserRating, value: string) => {
    setUserRatings(prev => prev.map((r, i) => i === ratingUserIndex ? { ...r, [field]: value } : r))
  }

  const goToNextRating = async () => {
    if (ratingUserIndex < userRatings.length - 1) { setRatingUserIndex(i => i + 1) }
    else { await handleSaveSpirit() }
  }

  const handleSaveSpirit = async () => {
    if (!newSpirit.name.trim()) { alert('Please enter at least the spirit name'); return }
    setIsSaving(true)
    try {
      const spiritToSave = { ...newSpirit, abv: newSpirit.abv ? parseFloat(newSpirit.abv) : undefined }
      const ratingsToSave = userRatings.map(r => ({
        user_name: r.user_name,
        rating: r.rating || undefined,
        value_rating: r.value_rating || undefined,
        price: r.price ? parseFloat(r.price) : undefined,
        how_consumed: r.how_consumed || undefined,
        notes: r.notes || undefined,
      }))
      const result = await saveSpiritWithRatings(spiritToSave, ratingsToSave)
      if (result.success) { alert('Spirit saved! 🥃'); setScreen('home') }
      else { alert('Error saving. Please try again.') }
    } catch (err) {
      console.error(err); alert('Error saving. Please try again.')
    } finally { setIsSaving(false) }
  }

  const handleAddUser = async () => {
    if (!newUserName.trim()) { alert('Please enter a name'); return }
    setIsAddingUser(true)
    const result = await addAppUser(newUserName.trim(), newUserKey.trim() || undefined, newUserProfile.trim() || undefined)
    if (result) { await loadUsers(); setNewUserName(''); setNewUserKey(''); setNewUserProfile(''); alert(newUserName + ' added!') }
    else { alert('Error adding user.') }
    setIsAddingUser(false)
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm('Remove ' + name + '?')) return
    await deleteAppUser(id); await loadUsers()
  }

  const handleSaveProfile = async (userId: string, profileText: string) => {
    await updateUserProfiles(userId, profileText); await loadUsers(); setEditingProfile(null)
  }

  const handleGenerateSummary = async (user: AppUser) => {
    setIsGeneratingSummary(user.id)
    try {
      const allSpirits = await getSpiritsForUsers([user.name])
      if (allSpirits.length === 0) { alert('No spirits history yet for ' + user.name + '. Add some first!'); return }
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + MASTER_API_KEY },
        body: JSON.stringify({
          model: 'grok-4.3',
          messages: [{ role: 'user', content: GROK_PERSONALITY + '\n\nBased on this person\'s spirits history, write a SHORT 2-3 sentence taste profile summary. Be specific about what styles, flavors, and spirits they love and avoid. Make it fun and personal.\n\nSpirits history:\n' + JSON.stringify(allSpirits) + '\n\nReturn ONLY the summary paragraph, no other text.' }],
          max_tokens: 300
        })
      })
      const data = await response.json()
      const summary = data.choices?.[0]?.message?.content || ''
      if (summary) { await generateAndSaveTasteSummary(user.id, summary); await loadUsers(); alert('Taste summary generated for ' + user.name + '!') }
    } catch (err) { console.error(err); alert('Error generating summary.') }
    finally { setIsGeneratingSummary(null) }
  }

  const handleLogoTap = () => {
    const newCount = logoTapCount + 1
    setLogoTapCount(newCount)
    if (newCount >= 3) { setLogoTapCount(0); setScreen('admin') }
  }

  const resetQuiz = () => {
    setQuizStep(0); setSpiritType(''); setWhiskeyStyle(''); setFlavorProfile('')
    setBody(''); setFinish(''); setAgePreference(''); setPeatPreference('')
    setServing(''); setPriceMin(''); setPriceMax(''); setAdventure(''); setSubStyle('')
  }

  const buildQuizSteps = () => {
    const steps: { title: string; content: React.ReactNode }[] = []

    steps.push({
      title: 'What are you in the mood for?',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {SPIRIT_TYPES.map(st => (
            <button key={st.id} onClick={() => setSpiritType(st.id)}
              style={{ padding: '14px', borderRadius: '14px', border: '2px solid', cursor: 'pointer', background: spiritType === st.id ? '#92400E' : '#2A1F17', borderColor: spiritType === st.id ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>
              {st.label}
            </button>
          ))}
        </div>
      )
    })

    steps.push({
      title: 'Are you feeling adventurous?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {['🏠 Something familiar — classic styles I know I like', '🗺️ A bit far afield — interesting but not too out there', '🌍 Very unique — surprise me with something rare'].map(opt =>
            optionBtn(opt, opt, adventure, setAdventure)
          )}
        </div>
      )
    })

    if (['whiskey', 'scotch', 'irish', 'japanese', 'rye', 'bourbon'].includes(spiritType)) {
      steps.push({ title: 'What style of whiskey?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>{WHISKEY_STYLES.map(s => optionBtn(s, s, whiskeyStyle, setWhiskeyStyle))}</div>) })
      steps.push({ title: 'What flavor profile calls to you?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{FLAVOR_PROFILES.map(f => optionBtn(f, f, flavorProfile, setFlavorProfile))}</div>) })
      steps.push({ title: 'How full-bodied?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[...BODY_OPTIONS, 'No Preference'].map(b => optionBtn(b, b, body, setBody))}</div>) })
      steps.push({ title: 'Finish preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[...FINISH_OPTIONS, 'No Preference'].map(f => optionBtn(f, f, finish, setFinish))}</div>) })
      steps.push({ title: 'Age preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{AGE_OPTIONS.map(a => optionBtn(a, a, agePreference, setAgePreference))}</div>) })
      if (PEAT_ELIGIBLE.includes(spiritType) || ['Single Malt', 'Blended', 'Irish', 'Japanese', 'Other'].includes(whiskeyStyle)) {
        steps.push({ title: 'Peat & smoke preference?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{PEAT_OPTIONS.map(p => optionBtn(p, p, peatPreference, setPeatPreference))}</div>) })
      }
      steps.push({ title: 'How are you drinking it tonight?', content: (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>{SERVING_OPTIONS.map(sv => optionBtn(sv, sv, serving, setServing))}</div>) })
    }

    if (spiritType === 'tequila') {
      steps.push({ title: 'Tequila style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{TEQUILA_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
      steps.push({ title: 'How are you drinking it?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Sipping neat', 'On the rocks', 'Cocktail (margarita etc)', 'No preference'].map(s => optionBtn(s, s, serving, setServing))}</div>) })
    }

    if (spiritType === 'mezcal') {
      steps.push({ title: 'Smoke level?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{['Light smoke', 'Medium smoke', 'Heavy smoke — the smokier the better', 'No preference'].map(s => optionBtn(s, s, peatPreference, setPeatPreference))}</div>) })
    }

    if (spiritType === 'rum') {
      steps.push({ title: 'Rum style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{RUM_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
    }

    if (spiritType === 'gin') {
      steps.push({ title: 'Gin style?', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{GIN_STYLES.map(s => optionBtn(s, s, subStyle, setSubStyle))}</div>) })
    }

    steps.push({
      title: 'Price range per pour?',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Min ($)</label>
              <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="0" style={s.input} />
            </div>
            <span style={{ color: '#FCD34D', paddingBottom: '14px' }}>—</span>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Max ($)</label>
              <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="50" style={s.input} />
            </div>
          </div>
          <button onClick={() => { setPriceMin(''); setPriceMax('') }}
            style={{ background: '#2A1F17', border: '1px solid #78350F', borderRadius: '14px', padding: '14px', color: 'white', cursor: 'pointer' }}>
            No Price Preference
          </button>
        </div>
      )
    })

    return steps
  }

  const callGrok = async () => {
    if (scannedImages.length === 0) { alert('Please scan or upload a menu or bar photo first!'); return }
    setIsLoading(true); setRecommendations([]); setWorstPick(null); setScreen('results')

    const selectedUserNamesList = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name)
    const selectedUserNames = selectedUserNamesList.join(', ')
    const allSpirits = await getSpiritsForUsers(selectedUserNamesList)

    const selectedUserObjects = users.filter(u => selectedUsers.includes(u.id))
    const userContext = selectedUserObjects.map(u => {
      const parts = ['User: ' + u.name]
      if (u.taste_profile) parts.push('Their own description: "' + u.taste_profile + '"')
      if (u.taste_summary) parts.push('AI taste summary: "' + u.taste_summary + '"')
      return parts.join('\n')
    }).join('\n\n')

    const spiritLabel = SPIRIT_TYPES.find(st => st.id === spiritType)?.label || spiritType
    const preferences = [
      'Spirit type: ' + (spiritLabel || 'no preference'),
      whiskeyStyle ? 'Whiskey style: ' + whiskeyStyle : '',
      subStyle ? 'Style: ' + subStyle : '',
      flavorProfile ? 'Flavor profile: ' + flavorProfile : '',
      body ? 'Body: ' + body : '',
      finish ? 'Finish: ' + finish : '',
      agePreference ? 'Age: ' + agePreference : '',
      peatPreference ? 'Peat/smoke: ' + peatPreference : '',
      serving ? 'Serving: ' + serving : '',
      adventure ? 'Adventurousness: ' + adventure : '',
      priceMin && priceMax ? 'Price range: $' + priceMin + '-$' + priceMax : '',
    ].filter(Boolean).join(', ')

    const spiritsHistory = allSpirits.length > 0 ? 'Past spirits ratings:\n' + JSON.stringify(allSpirits) : 'No past spirits history — rely on stated preferences.'
    const menuImages = scannedImages.filter(i => i.mode === 'menu')
    const barImages = scannedImages.filter(i => i.mode === 'bar')

    try {
      let fullSpiritsList = ''

      if (menuImages.length > 0) {
        setOcrStatus('Reading spirits menu with Google Vision...')
        const ocrTexts: string[] = []
        for (let i = 0; i < menuImages.length; i++) {
          setOcrStatus('Reading page ' + (i + 1) + ' of ' + menuImages.length + '...')
          const text = await extractTextWithVision(menuImages[i].dataUrl)
          if (text) ocrTexts.push(text)
        }
        fullSpiritsList += ocrTexts.join('\n\n--- NEXT PAGE ---\n\n')
      }

      if (barImages.length > 0) {
        setOcrStatus('Identifying bottles from bar photos...')
        const barResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
          body: JSON.stringify({
            model: 'grok-4.3',
            messages: [{ role: 'user', content: [...barImages.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })), { type: 'text', text: 'You are an expert spirits identifier. Examine these bar shelf photos carefully. Identify every bottle you can see — include name, distillery, expression/style, and age statement if visible. Even partially visible bottles. Be thorough. Return ONLY a JSON array:\n[{"name":"full spirit name","distillery":"distillery","style":"bourbon/scotch/tequila etc","age":"age statement or null","visible_price":null}]' }] }],
            max_tokens: 1000
          })
        })
        const barData = await barResponse.json()
        const barContent = barData.choices?.[0]?.message?.content || '[]'
        const barSpirits = JSON.parse(barContent.replace(/```json|```/g, '').trim())
        fullSpiritsList += '\n\nFROM BAR PHOTOS:\n' + barSpirits.map((bs: any) => bs.name + (bs.distillery ? ' by ' + bs.distillery : '') + (bs.age ? ' ' + bs.age : '')).join('\n')
      }

      if (!fullSpiritsList.trim()) { alert('Could not read any spirits. Please try clearer photos.'); setScreen('quiz'); return }

      setOcrStatus('Asking your bartender for recommendations...')

      const promptText = GROK_PERSONALITY + '\n\n' +
        `CRITICAL RULE: You may ONLY recommend spirits that appear in the list below. Do not invent or hallucinate any spirit not shown.

You are recommending spirits for: ${selectedUserNames}

USER PROFILES:
${userContext}

${spiritsHistory}

Tonight's preferences: ${preferences}

SPIRITS AVAILABLE (from menu/bar scan — ONLY recommend from this list):
${fullSpiritsList}

TASK:
1. Parse the spirits list above
2. Evaluate each against the users' taste history and tonight's preferences
3. Pick the top 3 best matches AND the single worst match
4. Pay close attention to adventurousness preference
5. Be sassy, fun, and opinionated — but NEVER recommend a spirit not in the list

Return ONLY valid JSON:
{
  "extracted_spirits": [{"spirit_name": "exact name", "distillery": "or null", "style": "type", "age": "or null", "price": null}],
  "recommendations": [{"spirit_name": "exact name", "distillery": "or null", "age_statement": "or null", "price": null, "retail_price": null, "similarity_score": 9.2, "why_it_matches": "fun sassy explanation", "similar_to": "spirit from their history or null", "tasting_notes": "brief flavor profile", "potential_drawbacks": "honest risks or null"}],
  "worst_pick": {"spirit_name": "exact name", "distillery": "or null", "price": null, "why_its_bad": "fun sassy explanation"}
}`

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getApiKey() },
        body: JSON.stringify({ model: 'grok-4.3', messages: [{ role: 'user', content: promptText }], max_tokens: 2500 })
      })

      const data = await response.json()
      console.log('Grok response:', data)
      if (data.error) { alert('Grok error: ' + data.error.message); setScreen('quiz'); return }
      const content = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
      setExtractedSpirits(parsed.extracted_spirits || [])
      setRecommendations(parsed.recommendations || [])
      setWorstPick(parsed.worst_pick || null)
    } catch (err: any) {
      console.error(err); alert('Error: ' + (err?.message || String(err))); setScreen('quiz')
    } finally { setIsLoading(false); setOcrStatus('') }
  }

  const s: Record<string, any> = {
    page: { minHeight: '100vh', background: '#0F0A00', color: 'white', display: 'flex', flexDirection: 'column' },
    header: { background: '#1A1200', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #78350F' },
    backBtn: { background: 'none', border: 'none', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem' },
    primaryBtn: { background: '#92400E', border: 'none', borderRadius: '16px', padding: '18px', color: 'white', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', width: '100%' },
    secondaryBtn: { background: '#1A1200', border: '1px solid #78350F', borderRadius: '16px', padding: '18px', color: 'white', fontSize: '1rem', cursor: 'pointer', flex: 1 },
    card: { background: '#1A1200', borderRadius: '20px', padding: '20px', border: '1px solid #78350F' },
    input: { width: '100%', background: '#1A1200', border: '1px solid #78350F', borderRadius: '12px', padding: '12px 16px', color: 'white', fontSize: '1rem', boxSizing: 'border-box' as const },
    label: { display: 'block', color: '#FCD34D', fontSize: '0.85rem', marginBottom: '4px' },
  }

  const optionBtn = (label: string, value: string, current: string, setter: (v: string) => void) => (
    <button key={label} onClick={() => setter(current === value ? '' : value)}
      style={{ padding: '16px', borderRadius: '14px', fontSize: '0.95rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', width: '100%', background: current === value ? '#92400E' : '#1A1200', borderColor: current === value ? '#FCD34D' : '#78350F', color: 'white' }}>
      {label}
    </button>
  )

  const HelpPopup = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#1A1200', borderRadius: '24px', padding: '28px', border: '1px solid #78350F', maxWidth: '400px', width: '100%', maxHeight: '80vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#FEF3C7', fontSize: '1.3rem' }}>🥃 How to Use BarMatch</h2>
          <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: '#FCD34D', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>
        {[
          { icon: '👤', title: 'Select Who\'s Drinking', text: 'At startup, tap names to select who\'s at the bar tonight. Grok combines everyone\'s taste history.' },
          { icon: '📷', title: 'Scan the Bar', text: 'Three options: photograph the spirits menu, upload an image, or photograph the bar shelf itself. Grok identifies bottles from bar photos automatically.' },
          { icon: '🎯', title: 'Answer the Quiz', text: 'Tell Grok what spirit you want, your flavor preferences, age, peat level (for scotch), and how you\'re drinking it. Skip anything you don\'t care about.' },
          { icon: '🥃', title: 'Get Recommendations', text: 'Grok picks the top 3 spirits from the actual bar that match your taste history — plus one to avoid! Tap "🔍 What was found" to see the full list.' },
          { icon: '➕', title: 'Add Spirits You\'ve Tried', text: 'Tap "Add a Spirit" to save spirits you\'ve had. Scan the label or enter by hand. Rate them Amazing/Good/Fine/Bad.' },
          { icon: '👑', title: 'Admin (Tap Logo 3x)', text: 'Tap the 🥃 logo three times on the startup screen to manage users and taste profiles.' },
        ].map(item => (
          <div key={item.title} style={{ marginBottom: '20px' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 'bold', color: '#FEF3C7' }}>{item.icon} {item.title}</p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#D4A574', lineHeight: 1.5 }}>{item.text}</p>
          </div>
        ))}
        <button onClick={() => setShowHelp(false)} style={{ ...s.primaryBtn, marginTop: '8px' }}>Got it!</button>
      </div>
    </div>
  )

  if (screen === 'startup') return (
    <div style={s.page}>
      {showHelp && <HelpPopup />}
      <div style={{ background: '#1A1200', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #78350F' }}>
        <div style={{ width: '36px' }} />
        <div style={{ textAlign: 'center' }}>
          <h1 onClick={handleLogoTap} style={{ fontSize: '2rem', color: '#FEF3C7', margin: 0, cursor: 'pointer', userSelect: 'none' as const }}>🥃 BarMatch</h1>
          <p style={{ color: '#FCD34D', margin: '4px 0 0', fontSize: '0.9rem' }}>Your personal AI bartender</p>
        </div>
        <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1px solid #78350F', borderRadius: '50%', width: '36px', height: '36px', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>?</button>
      </div>
      <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '8px' }}>Who are we recommending for tonight?</h2>
        <p style={{ textAlign: 'center', color: '#FCD34D', fontSize: '0.9rem', marginBottom: '24px' }}>Tap names to select</p>
        {usersLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#FCD34D' }}>Loading...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#92400E', marginBottom: '16px' }}>No users yet!</p>
            <p style={{ color: '#FCD34D', fontSize: '0.9rem' }}>Tap the 🥃 logo 3 times to open Admin.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {users.map(u => (
              <button key={u.id} onClick={() => toggleSelectUser(u.id)}
                style={{ padding: '20px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: 'bold', border: '2px solid', cursor: 'pointer', background: selectedUsers.includes(u.id) ? '#92400E' : '#1A1200', borderColor: selectedUsers.includes(u.id) ? '#FCD34D' : '#78350F', color: 'white' }}>
                👤 {u.name}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { if (users.length > 0 && selectedUsers.length === 0) { alert('Please tap at least one name'); return; } setScreen('home') }}
          style={{ ...s.primaryBtn, marginTop: 'auto', padding: '20px', fontSize: '1.2rem' }}>
          Let's Drink! →
        </button>
      </div>
    </div>
  )

  if (screen === 'home') {
    const names = users.filter(u => selectedUsers.includes(u.id)).map(u => u.name).join(', ')
    return (
      <div style={s.page}>
        {showHelp && <HelpPopup />}
        <div style={{ background: '#1A1200', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #78350F' }}>
          <h1 style={{ fontSize: '1.8rem', color: '#FEF3C7', margin: 0 }}>🥃 BarMatch</h1>
          <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: '1px solid #78350F', borderRadius: '50%', width: '36px', height: '36px', color: '#FCD34D', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>?</button>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          <p style={{ textAlign: 'center', color: '#FCD34D' }}>Recommending for: <strong style={{ color: 'white' }}>{names || 'Everyone'}</strong></p>
          <button onClick={() => { setScannedImages([]); resetQuiz(); setScreen('scan') }}
            style={{ width: '100%', background: '#92400E', border: 'none', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>📷</span>
            Find a Spirit
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FDE68A' }}>Scan a menu or photograph the bar</span>
          </button>
          <button onClick={startAddSpirit}
            style={{ width: '100%', background: '#1A1200', border: '2px solid #78350F', borderRadius: '24px', padding: '48px 24px', color: 'white', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '3rem' }}>➕</span>
            Add a Spirit
            <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#FCD34D' }}>Save a spirit you've tried</span>
          </button>
          <button onClick={() => setScreen('startup')} style={{ background: 'none', border: 'none', color: '#78350F', cursor: 'pointer', fontSize: '0.9rem' }}>← Switch users</button>
        </div>
      </div>
    )
  }

  if (screen === 'scan') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('home')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Scan the Bar</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ textAlign: 'center', color: '#FCD34D', margin: 0 }}>Choose how to add spirits:</p>
        <label style={{ width: '100%', background: '#92400E', border: 'none', borderRadius: '20px', padding: '28px 24px', color: 'white', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxSizing: 'border-box' as const }}>
          <span style={{ fontSize: '2.5rem' }}>📋</span>
          Photo a Spirits Menu
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#FDE68A' }}>Read by Google Vision OCR — very accurate</span>
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => handleFileInput(e, 'menu')} style={{ display: 'none' }} />
        </label>
        <label style={{ width: '100%', background: '#1A1200', border: '2px solid #78350F', borderRadius: '20px', padding: '28px 24px', color: 'white', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxSizing: 'border-box' as const }}>
          <span style={{ fontSize: '2.5rem' }}>📤</span>
          Upload a Menu Image
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#FCD34D' }}>Choose a saved photo from your device</span>
          <input type="file" accept="image/*" multiple onChange={e => handleFileInput(e, 'menu')} style={{ display: 'none' }} />
        </label>
        <label style={{ width: '100%', background: '#1A1200', border: '2px solid #92400E', borderRadius: '20px', padding: '28px 24px', color: 'white', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxSizing: 'border-box' as const }}>
          <span style={{ fontSize: '2.5rem' }}>🍾</span>
          Photograph the Bar Shelf
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#FCD34D' }}>Zoom in close — 4-6 bottles per photo works best</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#92400E' }}>Take multiple close-up shots, not one wide shelf photo</span>
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={e => handleFileInput(e, 'bar')} style={{ display: 'none' }} />
        </label>
        {scannedImages.length > 0 && (
          <div>
            <p style={{ color: '#FCD34D', marginBottom: '12px' }}>
              Added: {scannedImages.filter(i => i.mode === 'menu').length} menu page(s), {scannedImages.filter(i => i.mode === 'bar').length} bar photo(s)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              {scannedImages.map(img => (
                <div key={img.id} style={{ position: 'relative' }}>
                  <img src={img.dataUrl} style={{ width: '100%', borderRadius: '8px', opacity: img.mode === 'bar' ? 0.8 : 1 }} />
                  <div style={{ position: 'absolute', top: '2px', left: '2px', background: img.mode === 'bar' ? '#92400E' : '#1A6B1A', borderRadius: '4px', padding: '1px 5px', fontSize: '0.65rem', color: 'white' }}>
                    {img.mode === 'bar' ? 'BAR' : 'MENU'}
                  </div>
                  <button onClick={() => setScannedImages(prev => prev.filter(i => i.id !== img.id))}
                    style={{ position: 'absolute', top: '4px', right: '4px', background: '#DC2626', border: 'none', borderRadius: '50%', width: '20px', height: '20px', color: 'white', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => { setQuizStep(0); setScreen('quiz') }}
              style={{ width: '100%', background: '#92400E', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem' }}>
              Recommend Now →
            </button>
          </div>
        )}
      </div>
    </div>
  )

  if (screen === 'quiz') {
    const steps = buildQuizSteps()
    const step = steps[Math.min(quizStep, steps.length - 1)]
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => quizStep === 0 ? setScreen('scan') : setQuizStep(q => q - 1)} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Question {quizStep + 1} of {steps.length}</h2>
        </div>
        <div style={{ height: '4px', background: '#1A1200' }}>
          <div style={{ height: '100%', background: '#92400E', width: ((quizStep + 1) / steps.length * 100) + '%', transition: 'width 0.3s' }} />
        </div>
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' as const }}>
          <h3 style={{ fontSize: '1.3rem', textAlign: 'center', color: '#FEF3C7', margin: 0 }}>{step.title}</h3>
          {step.content}
        </div>
        <div style={{ padding: '24px', display: 'flex', gap: '12px' }}>
          {quizStep < steps.length - 1 ? (
            <>
              <button onClick={() => setQuizStep(q => q + 1)} style={s.secondaryBtn}>Next →</button>
              <button onClick={callGrok} style={{ flex: 1, background: '#92400E', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>Recommend Now! 🥃</button>
            </>
          ) : (
            <button onClick={callGrok} style={s.primaryBtn}>Find My Spirit! 🥃</button>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'results') {
    const filtered = priceFilter ? recommendations.filter(r => (r.price || 0) >= priceFilter.min && (r.price || 0) <= priceFilter.max) : recommendations
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => setScreen('quiz')} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Your Recommendations</h2>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🥃</div>
              <p style={{ color: '#FCD34D', fontSize: '1.2rem' }}>{ocrStatus || 'Your bartender is on it...'}</p>
              <p style={{ color: '#78350F', fontSize: '0.9rem' }}>This takes about 15-20 seconds</p>
            </div>
          ) : (
            <>
              <div style={{ background: '#0A0A1E', borderRadius: '16px', border: '1px solid #4A4A8A', overflow: 'hidden' }}>
                <button onClick={() => setShowExtracted(p => !p)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '12px 16px', color: '#A0A0FF', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>🔍 What was found ({extractedSpirits.length} spirits)</span>
                  <span>{showExtracted ? '▲' : '▼'}</span>
                </button>
                {showExtracted && (
                  <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {extractedSpirits.length === 0 ? (
                      <p style={{ color: '#FF6B6B', fontSize: '0.85rem', margin: 0 }}>⚠️ No spirits found. Try a clearer photo.</p>
                    ) : (
                      extractedSpirits.map((sp, i) => (
                        <div key={i} style={{ background: '#1A1A3A', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', color: '#C0C0FF' }}>
                          <strong>{sp.spirit_name || sp.name}</strong>
                          {sp.distillery ? ' — ' + sp.distillery : ''}
                          {sp.age || sp.age_statement ? ' · ' + (sp.age || sp.age_statement) : ''}
                          {sp.price ? <span style={{ color: '#A0FFA0', marginLeft: '8px' }}>${sp.price}</span> : ''}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {[{ label: 'All Prices', min: 0, max: 99999 }, { label: 'Under $15', min: 0, max: 15 }, { label: '$15–$30', min: 15, max: 30 }, { label: '$30+', min: 30, max: 99999 }].map(f => (
                  <button key={f.label} onClick={() => f.label === 'All Prices' ? setPriceFilter(null) : setPriceFilter({ min: f.min, max: f.max })}
                    style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', background: (f.label === 'All Prices' && !priceFilter) || priceFilter?.min === f.min ? '#92400E' : '#1A1200', borderColor: (f.label === 'All Prices' && !priceFilter) || priceFilter?.min === f.min ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {filtered.length === 0 && recommendations.length > 0 && <p style={{ textAlign: 'center', color: '#78350F', padding: '40px' }}>No spirits match this price filter.</p>}
              {filtered.map((rec, i) => (
                <div key={i} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FEF3C7' }}>#{i + 1} {rec.spirit_name}</h3>
                      {rec.distillery && <p style={{ margin: '2px 0', color: '#FCD34D', fontSize: '0.9rem' }}>{rec.distillery}{rec.age_statement ? ' · ' + rec.age_statement : ''}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {rec.price && <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#FCD34D' }}>${rec.price}</div>}
                      {rec.retail_price && <div style={{ fontSize: '0.75rem', color: '#78350F' }}>Retail ~${rec.retail_price}</div>}
                    </div>
                  </div>
                  <div style={{ background: '#0F0A00', borderRadius: '12px', padding: '12px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#FDE68A' }}>🎯 {rec.why_it_matches}</p>
                  </div>
                  {rec.similar_to && <p style={{ margin: '6px 0', fontSize: '0.85rem', color: '#86EFAC' }}>🥃 Similar to: <em>{rec.similar_to}</em></p>}
                  <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#D4A574' }}>👃 {rec.tasting_notes}</p>
                  {rec.potential_drawbacks && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#78350F' }}>⚠️ {rec.potential_drawbacks}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#0F0A00', borderRadius: '3px' }}>
                      <div style={{ height: '100%', background: '#92400E', borderRadius: '3px', width: (rec.similarity_score / 10 * 100) + '%' }} />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#FCD34D' }}>{rec.similarity_score}/10</span>
                  </div>
                </div>
              ))}
              {worstPick && (
                <div style={{ background: '#2D0A0A', borderRadius: '20px', padding: '20px', border: '2px solid #7F1D1D', marginTop: '8px' }}>
                  <h3 style={{ margin: '0 0 8px', color: '#FCA5A5', fontSize: '1rem' }}>💀 Worst Pick at This Bar</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 'bold', color: '#FEF2F2' }}>{worstPick.spirit_name}</p>
                      {worstPick.distillery && <p style={{ margin: '2px 0', color: '#FCA5A5', fontSize: '0.85rem' }}>{worstPick.distillery}</p>}
                    </div>
                    {worstPick.price && <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#FCA5A5' }}>${worstPick.price}</div>}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#FECACA', fontStyle: 'italic' }}>😬 {worstPick.why_its_bad}</p>
                </div>
              )}
              {recommendations.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button onClick={callGrok} style={s.secondaryBtn}>🔄 More Picks</button>
                  <button onClick={() => setScreen('home')} style={{ flex: 1, background: '#92400E', border: 'none', color: 'white', borderRadius: '16px', padding: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🏠 Home</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'addSpirit') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('home')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>Add a Spirit</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ textAlign: 'center', color: '#FCD34D' }}>How would you like to add this spirit?</p>

        {/* Scan label with camera */}
        <label style={{ width: '100%', background: '#92400E', border: 'none', borderRadius: '24px', padding: '36px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', boxSizing: 'border-box' as const }}>
          <span style={{ fontSize: '3rem' }}>📷</span>
          Scan Bottle Label
          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#FDE68A' }}>AI reads the label automatically</span>
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={handleLabelFileInput} style={{ display: 'none' }} />
        </label>

        {/* Enter by hand */}
        <button onClick={() => setScreen('addSpiritForm')}
          style={{ width: '100%', background: '#1A1200', border: '2px solid #78350F', borderRadius: '24px', padding: '36px 24px', color: 'white', fontSize: '1.3rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '3rem' }}>✏️</span>
          Enter by Hand
          <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#FCD34D' }}>Fill in what you know</span>
        </button>

        {isParsingLabel && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#FCD34D' }}>🥃 Reading label...</div>
        )}
      </div>
    </div>
  )

  if (screen === 'addSpiritForm') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('addSpirit')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>Spirit Details</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' as const }}>
        <p style={{ color: '#FCD34D', fontSize: '0.9rem', margin: 0 }}>Fill in what you know — only the name is required</p>
        {[
          { label: 'Spirit Name *', key: 'name', placeholder: 'e.g. Macallan 12 Double Cask' },
          { label: 'Distillery', key: 'distillery', placeholder: 'e.g. The Macallan' },
          { label: 'Age Statement', key: 'age_statement', placeholder: 'e.g. 12 Year Old' },
          { label: 'ABV %', key: 'abv', placeholder: 'e.g. 40' },
          { label: 'Region', key: 'region', placeholder: 'e.g. Speyside, Highland' },
          { label: 'Nose Notes', key: 'nose_notes', placeholder: 'What did it smell like?' },
          { label: 'Palate Notes', key: 'palate_notes', placeholder: 'What did it taste like?' },
          { label: 'Finish Notes', key: 'finish_notes', placeholder: 'How did it finish?' },
          { label: 'General Tasting Notes', key: 'tasting_notes', placeholder: 'Overall impressions' },
        ].map(field => (
          <div key={field.key}>
            <label style={s.label}>{field.label}</label>
            <input value={newSpirit[field.key as keyof NewSpirit]} onChange={e => setNewSpirit(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} style={s.input} />
          </div>
        ))}
        <div>
          <label style={s.label}>Spirit Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {SPIRIT_TYPES.filter(st => st.id !== 'surprise').map(st => (
              <button key={st.id} onClick={() => setNewSpirit(prev => ({ ...prev, spirit_type: prev.spirit_type === st.id ? '' : st.id }))}
                style={{ padding: '10px', borderRadius: '10px', border: '1px solid', cursor: 'pointer', background: newSpirit.spirit_type === st.id ? '#92400E' : '#1A1200', borderColor: newSpirit.spirit_type === st.id ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.8rem' }}>
                {st.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={s.label}>Country</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setNewSpirit(prev => ({ ...prev, country: prev.country === c ? '' : c }))}
                style={{ padding: '10px', borderRadius: '10px', border: '1px solid', cursor: 'pointer', background: newSpirit.country === c ? '#92400E' : '#1A1200', borderColor: newSpirit.country === c ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.8rem' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { if (!newSpirit.name.trim()) { alert('Please enter the spirit name'); return; } setRatingUserIndex(0); setScreen('rateSpirit') }}
          style={{ ...s.primaryBtn, marginTop: '8px' }}>
          Next: Rate This Spirit →
        </button>
      </div>
    </div>
  )

  if (screen === 'rateSpirit') {
    const currentUser = userRatings[ratingUserIndex]
    const isLastUser = ratingUserIndex === userRatings.length - 1
    return (
      <div style={s.page}>
        <div style={s.header}>
          <button onClick={() => ratingUserIndex === 0 ? setScreen('addSpiritForm') : setRatingUserIndex(i => i - 1)} style={s.backBtn}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Rate: {newSpirit.name}</h2>
        </div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {userRatings.length > 1 && (
            <div style={{ background: '#1A1200', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#FCD34D', fontSize: '1.1rem', fontWeight: 'bold' }}>Rating for: {currentUser?.user_name}</p>
              <p style={{ margin: '4px 0 0', color: '#78350F', fontSize: '0.85rem' }}>{ratingUserIndex + 1} of {userRatings.length} people</p>
            </div>
          )}
          <div>
            <label style={s.label}>How was it?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {RATINGS.map(r => (
                <button key={r} onClick={() => updateRating('rating', currentUser?.rating === r ? '' : r)}
                  style={{ padding: '16px', borderRadius: '12px', border: '2px solid', cursor: 'pointer', background: currentUser?.rating === r ? '#92400E' : '#1A1200', borderColor: currentUser?.rating === r ? '#FCD34D' : '#78350F', color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>
                  {r === 'Amazing' ? '🤩 Amazing' : r === 'Good' ? '😊 Good' : r === 'Fine' ? '😐 Fine' : '😞 Bad'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.label}>Value for money? (optional)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {VALUE_RATINGS.map(r => (
                <button key={r} onClick={() => updateRating('value_rating', currentUser?.value_rating === r ? '' : r)}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', background: currentUser?.value_rating === r ? '#92400E' : '#1A1200', borderColor: currentUser?.value_rating === r ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.9rem' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.label}>How did you drink it? (optional)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {SERVING_OPTIONS.map(r => (
                <button key={r} onClick={() => updateRating('how_consumed', currentUser?.how_consumed === r ? '' : r)}
                  style={{ padding: '12px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', background: currentUser?.how_consumed === r ? '#92400E' : '#1A1200', borderColor: currentUser?.how_consumed === r ? '#FCD34D' : '#78350F', color: 'white', fontSize: '0.85rem' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.label}>Price paid (optional)</label>
            <input type="number" value={currentUser?.price || ''} onChange={e => updateRating('price', e.target.value)} placeholder="e.g. 18" style={s.input} />
          </div>
          <div>
            <label style={s.label}>Notes (optional)</label>
            <input value={currentUser?.notes || ''} onChange={e => updateRating('notes', e.target.value)} placeholder="Anything else to remember?" style={s.input} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => { updateRating('rating', ''); updateRating('value_rating', ''); updateRating('price', ''); goToNextRating() }} style={s.secondaryBtn}>Skip</button>
            <button onClick={goToNextRating} disabled={isSaving}
              style={{ flex: 1, background: '#92400E', border: 'none', color: 'white', borderRadius: '16px', padding: '18px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? 'Saving...' : isLastUser ? '💾 Save Spirit' : 'Next Person →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'admin') return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => setScreen('startup')} style={s.backBtn}>← Back</button>
        <h2 style={{ margin: 0 }}>👑 Admin — Manage Users</h2>
      </div>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' as const }}>
        <div style={s.card}>
          <h3 style={{ margin: '0 0 16px', color: '#FEF3C7' }}>Add New User</h3>
          <label style={s.label}>Name</label>
          <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="e.g. Sarah" style={{ ...s.input, marginBottom: '12px' }} />
          <label style={s.label}>Their Grok API Key (optional)</label>
          <input value={newUserKey} onChange={e => setNewUserKey(e.target.value)} placeholder="xai-... or leave blank" style={{ ...s.input, marginBottom: '12px' }} />
          <label style={s.label}>Taste Profile (optional)</label>
          <textarea value={newUserProfile} onChange={e => setNewUserProfile(e.target.value)} placeholder="e.g. I love peaty Islay scotch, hate sweet bourbon, prefer things neat..."
            style={{ ...s.input, minHeight: '80px', resize: 'vertical' as const, marginBottom: '16px' }} />
          <button onClick={handleAddUser} disabled={isAddingUser} style={{ ...s.primaryBtn, opacity: isAddingUser ? 0.6 : 1 }}>
            {isAddingUser ? 'Adding...' : '+ Add User'}
          </button>
        </div>
        <div>
          <h3 style={{ color: '#FEF3C7', margin: '0 0 12px' }}>Current Users ({users.length})</h3>
          {users.map(u => (
            <div key={u.id} style={{ ...s.card, marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#FEF3C7', fontSize: '1.1rem' }}>{u.name} {u.is_admin ? '👑' : ''}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#78350F' }}>{u.grok_api_key ? '🔑 Has own API key' : '🔑 Using master key'}</p>
                </div>
                {!u.is_admin && (
                  <button onClick={() => handleDeleteUser(u.id, u.name)}
                    style={{ background: '#DC2626', border: 'none', borderRadius: '8px', padding: '8px 12px', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ background: '#0F0A00', borderRadius: '12px', padding: '12px', margin: '10px 0' }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: '#FCD34D', fontWeight: 'bold' }}>✍️ TASTE PROFILE — What do they like in their own words?</p>
                <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#78350F' }}>This goes directly to Grok with every recommendation.</p>
              </div>
              {editingProfile?.id === u.id ? (
                <div>
                  <textarea value={editingProfile.text} onChange={e => setEditingProfile({ id: u.id, text: e.target.value })}
                    style={{ ...s.input, minHeight: '80px', resize: 'vertical' as const, marginBottom: '8px' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleSaveProfile(u.id, editingProfile.text)}
                      style={{ flex: 1, background: '#92400E', border: 'none', borderRadius: '10px', padding: '10px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                    <button onClick={() => setEditingProfile(null)}
                      style={{ flex: 1, background: '#1A1200', border: '1px solid #78350F', borderRadius: '10px', padding: '10px', color: 'white', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  {u.taste_profile
                    ? <p style={{ margin: '8px 0', fontSize: '0.85rem', color: '#FDE68A', fontStyle: 'italic' }}>"{u.taste_profile}"</p>
                    : <p style={{ margin: '8px 0', fontSize: '0.85rem', color: '#78350F' }}>No taste profile yet</p>}
                  <button onClick={() => setEditingProfile({ id: u.id, text: u.taste_profile || '' })}
                    style={{ background: '#1A1200', border: '1px solid #78350F', borderRadius: '8px', padding: '6px 12px', color: '#FCD34D', cursor: 'pointer', fontSize: '0.8rem' }}>
                    ✏️ Edit Profile
                  </button>
                </div>
              )}
              {u.taste_summary && (
                <div style={{ background: '#0F0A00', borderRadius: '10px', padding: '10px', marginTop: '8px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: '#78350F' }}>🤖 AI Taste Summary:</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#D4A574' }}>{u.taste_summary}</p>
                </div>
              )}
              <button onClick={() => handleGenerateSummary(u)} disabled={isGeneratingSummary === u.id}
                style={{ background: '#0F0A00', border: '1px solid #78350F', borderRadius: '8px', padding: '6px 12px', color: '#FCD34D', cursor: 'pointer', fontSize: '0.8rem', marginTop: '8px', opacity: isGeneratingSummary === u.id ? 0.6 : 1 }}>
                {isGeneratingSummary === u.id ? '⏳ Generating...' : '🤖 Generate Taste Summary'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return null
}
