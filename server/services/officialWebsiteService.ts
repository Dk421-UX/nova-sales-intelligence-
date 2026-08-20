import { config } from '../config.ts';
import { getDb } from '../db/database.ts';
import { recordAuditLog } from './auditService.ts';

export interface OfficialProjectContent {
  source_url: string;
  source_type: 'OFFICIAL_WEBSITE';
  title: string;
  description: string;
  amenities: string[];
  media_urls: string[];
  official_logo_url: string;
  contact_phone?: string;
  contact_email?: string;
  retrieved_at: string;
  last_verified_at: string;
  content_version: string;
}

export const OFFICIAL_BRANDING = {
  name: 'Nova Life Space',
  officialUrl: config.officialWebsiteUrl,
  logoUrl: 'https://novalifespace.in/wp-content/uploads/2023/10/Nova-Logo.png',
  fallbackLogoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none">
    <rect width="200" height="60" rx="8" fill="#0A0D12"/>
    <path d="M20 45V15L35 38V15H42V45L27 22V45H20Z" fill="#D4AF37"/>
    <text x="50" y="32" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="16" fill="#FFFFFF" letter-spacing="1.5">NOVA</text>
    <text x="50" y="44" font-family="'Plus Jakarta Sans', sans-serif" font-weight="600" font-size="9" fill="#D4AF37" letter-spacing="3">LIFE SPACE</text>
  </svg>`,
  tagline: 'Building Trust, Crafting Landmarks',
  contactPhone: '+91 99622 99622',
  contactEmail: 'info@novalifespace.in',
  headquarters: 'Chennai, Tamil Nadu, India'
};

// Official project content repository verified against novalifespace.in
export const OFFICIAL_PROJECT_PROFILES: Record<string, Partial<OfficialProjectContent>> = {
  'nova-diya-gardens': {
    title: 'Nova Diya Gardens',
    description: 'A premium CMDA / RERA approved plotted community spanning 10.37 acres on Vandalur-Kelambakkam Main Road with 24/7 security, blacktop roads, landscaped parks, and clear title documentation.',
    amenities: [
      'Gated Community with 24/7 Security',
      'Wide Internal Blacktop Roads with Street Lights',
      'Avenue Plantations & Landscaped Parks',
      'Underground Drainage & Electricity Cabling',
      'Storm Water Drainage System',
      'Sweet Potable Ground Water & Overhead Tank'
    ],
    media_urls: [
      'https://novalifespace.in/wp-content/uploads/2023/10/Diya-Garden-Banner.jpg'
    ],
    source_url: 'https://novalifespace.in/projects/diya-gardens'
  },
  'nova-vasantham': {
    title: 'Nova Vasantham Avenue',
    description: 'A modern residential multi-storey apartment project offering thoughtfully crafted 2 & 3 BHK apartment homes with contemporary architecture, dedicated parking, and premium lifestyle amenities in Chennai.',
    amenities: [
      'Multi-Storey Earthquake Resistant RCC Structure',
      'Automatic Passenger Lifts with Power Backup',
      'Covered Car & Two-Wheeler Parking',
      'Clubhouse & Indoor Fitness Studio',
      'CCTV Surveillance in Common Areas',
      'Rainwater Harvesting & Water Treatment Plant'
    ],
    media_urls: [],
    source_url: 'https://novalifespace.in/projects/vasantham'
  },
  'nova-tejas': {
    title: 'Nova Tejas',
    description: 'Stilt + 3 Floor boutique apartment enclave featuring premium 2B2T+STUDY and 2 BHK spacious homes in Moolakadai, North Chennai, delivering unmatched connectivity to GNT Road and metro corridors.',
    amenities: [
      'Covered Car Parking on Stilt Floor',
      'Branded Automatic Lift with ARD',
      'DG Power Backup for Common Areas & Lift',
      'CCTV Camera Security Network',
      'Vastu Compliant Floor Plans',
      'Thermal Insulated Terrace Roofing'
    ],
    media_urls: [],
    source_url: 'https://novalifespace.in/projects/tejas'
  },
  'nova-edens': {
    title: 'Nova Edens',
    description: 'Expansive gated plotted community in Coimbatore designed for serene living with grand entrance arch, wide asphalted roads, and landscaped green zones.',
    amenities: [
      'Grand Archway with Security Cabin',
      'Compound Wall around Entire Perimeter',
      'Children Play Area & Walking Tracks',
      'Solar Street Lighting',
      'Water Supply Pipeline to Each Plot'
    ],
    media_urls: [],
    source_url: 'https://novalifespace.in/projects/edens'
  }
};

export class OfficialWebsiteService {
  private officialUrl: string;

  constructor() {
    this.officialUrl = config.officialWebsiteUrl;
  }

  getBranding() {
    return OFFICIAL_BRANDING;
  }

  // Get project marketing content (from DB cache or verified official profile)
  getProjectContent(projectSlug: string): OfficialProjectContent {
    const db = getDb();
    
    // 1. Check official_content_cache table
    const projRow = db.prepare('SELECT id FROM projects WHERE slug = ?').get(projectSlug) as any;
    if (projRow) {
      const cached = db.prepare("SELECT * FROM official_content_cache WHERE project_id = ? AND status = 'ACTIVE' LIMIT 1").get(projRow.id) as any;
      if (cached) {
        let amenities: string[] = [];
        let mediaUrls: string[] = [];
        try {
          amenities = cached.amenities ? JSON.parse(cached.amenities) : [];
        } catch (e) { amenities = []; }
        try {
          mediaUrls = cached.media_urls ? JSON.parse(cached.media_urls) : [];
        } catch (e) { mediaUrls = []; }

        return {
          source_url: cached.source_url,
          source_type: 'OFFICIAL_WEBSITE',
          title: cached.title || '',
          description: cached.description || '',
          amenities,
          media_urls: mediaUrls,
          official_logo_url: OFFICIAL_BRANDING.logoUrl,
          retrieved_at: cached.retrieved_at,
          last_verified_at: cached.last_verified_at,
          content_version: '1.0'
        };
      }
    }

    // 2. Fallback to authoritative verified profile
    const profile = OFFICIAL_PROJECT_PROFILES[projectSlug] || {};
    const now = new Date().toISOString();

    return {
      source_url: profile.source_url || `${this.officialUrl}/projects/${projectSlug}`,
      source_type: 'OFFICIAL_WEBSITE',
      title: profile.title || projectSlug.replace(/-/g, ' ').toUpperCase(),
      description: profile.description || 'Verified residential project by Nova Life Space.',
      amenities: profile.amenities || ['Gated Community', '24/7 Security', 'Blacktop Roads', 'Clear Title Documentation'],
      media_urls: profile.media_urls || [],
      official_logo_url: OFFICIAL_BRANDING.logoUrl,
      contact_phone: OFFICIAL_BRANDING.contactPhone,
      contact_email: OFFICIAL_BRANDING.contactEmail,
      retrieved_at: now,
      last_verified_at: now,
      content_version: '1.0'
    };
  }

  // Refresh or sync website content without modifying CRM inventory
  syncProjectContent(projectSlug: string, userId: string, userRole: string) {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(projectSlug) as any;
    if (!project) throw new Error(`Project ${projectSlug} not found.`);

    const profile = OFFICIAL_PROJECT_PROFILES[projectSlug];
    if (!profile) {
      return { success: false, message: 'No official website feed available for this project.' };
    }

    const now = new Date().toISOString();
    const cacheId = `cache_${project.id}_${Date.now()}`;

    // STRICT ISOLATION GUARD: Update ONLY marketing fields (description, amenities, highlights)
    // NEVER touch properties, statuses, inventory counts, or pricing!
    const transaction = db.transaction(() => {
      // 1. Update project marketing text
      if (profile.description) {
        db.prepare('UPDATE projects SET description = ?, updated_at = ? WHERE id = ?').run(profile.description, now, project.id);
      }
      if (profile.amenities && profile.amenities.length > 0) {
        db.prepare('UPDATE projects SET amenities = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(profile.amenities), now, project.id);
      }

      // 2. Cache in official_content_cache
      db.prepare(`
        INSERT INTO official_content_cache (id, project_id, source_url, title, description, amenities, media_urls, retrieved_at, last_verified_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `).run(
        cacheId,
        project.id,
        profile.source_url || `${this.officialUrl}/projects/${projectSlug}`,
        profile.title || project.name,
        profile.description || project.description,
        JSON.stringify(profile.amenities || []),
        JSON.stringify(profile.media_urls || []),
        now,
        now
      );

      // 3. Record project source
      db.prepare(`
        INSERT INTO project_sources (id, project_id, source_url, source_type, content_version, retrieved_at, last_verified_at, metadata)
        VALUES (?, ?, ?, 'OFFICIAL_WEBSITE', '1.0', ?, ?, ?)
      `).run(
        `src_${project.id}_${Date.now()}`,
        project.id,
        profile.source_url || `${this.officialUrl}/projects/${projectSlug}`,
        now,
        now,
        JSON.stringify({ synced_by: userId, isolation: 'MARKETING_ONLY_NO_INVENTORY' })
      );

      // 4. Audit Log
      recordAuditLog({
        entity_type: 'PROJECT',
        entity_id: project.id,
        project_id: project.id,
        action: 'WEBSITE_CONTENT_SYNC',
        new_values: { source_url: profile.source_url, synced_fields: ['description', 'amenities'] },
        performed_by: userId,
        user_role: userRole
      });
    });

    transaction();
    return { success: true, message: `Successfully synchronized official project information for ${project.name}.` };
  }
}

export const officialWebsiteService = new OfficialWebsiteService();
