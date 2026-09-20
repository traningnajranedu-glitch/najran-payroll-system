import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

type Row = Record<string, unknown>;

type SchoolAccountImport = { id: string; school_code: string; is_active: boolean; school_name: string; };

async function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('إعدادات الخادم غير مكتملة.');
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authorize(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: NextResponse.json({ error: 'غير مصرح.' }, { status: 401 }) };
  const client = await getAdminClient();
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 }) };
  const { data: admin } = await client.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  if (!admin) return { error: NextResponse.json({ error: 'هذا الإجراء مخصص لمدير النظام.' }, { status: 403 }) };
  return { client };
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\\s_-]+/g, '');
}

function text(row: Row, ...keys: string[]) {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeader(key), value);
  }
  for (const key of keys) {
    const value = row[key] ?? normalized.get(normalizeHeader(key));
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function bool(row: Row, ...keys: string[]) {
  const value = text(row, ...keys).trim().toLowerCase();
  if (!value) return true;
  if (['false','0','no','لا','غير نشط','موقوف','غير نشطة','موقوفة'].includes(value)) return false;
  if (['true','1','yes','نعم','نشط','نشطة','فعال','فعالة'].includes(value)) return true;
  return true;
}

function cleanSchoolCode(value: string) {
  return value.replace(/\.0$/, '').trim();
}

function cleanNationalId(value: string) {
  return value.replace(/\.0$/, '').replace(/\s+/g, '').trim();
}

function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
  if (!workbook.SheetNames.length) throw new Error('لم يتم العثور على أوراق داخل الملف.');
  const first = workbook.Sheets[workbook.SheetNames[0]];
  if (!first) throw new Error('ملف Excel لا يحتوي على ورقة بيانات.');
  return XLSX.utils.sheet_to_json<Row>(first, { defval: '' });
}

async function importSchools(client: any, rows: Row[]) {
  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], line = i + 2;
    const school_code = cleanSchoolCode(text(row, 'school_code','رمز المدرسة','كود المدرسة'));
    const school_name = text(row, 'school_name','اسم المدرسة');
    if (!school_code || !school_name) { skipped++; errors.push(`صف ${line}: رمز المدرسة واسم المدرسة مطلوبان.`); continue; }
    const payload = { school_code, school_name, manager_name: text(row,'manager_name','مدير المدرسة','اسم مدير المدرسة') || null, is_active: bool(row,'is_active','الحالة') };
    const { data: existing } = await client.from('schools').select('id').eq('school_code', school_code).maybeSingle();
    const { error } = existing
      ? await client.from('schools').update(payload).eq('id', existing.id)
      : await client.from('schools').insert(payload);
    if (error) { skipped++; errors.push(`صف ${line}: ${error.message}`); }
    else existing ? updated++ : added++;
  }
  return { added, updated, skipped, errors };
}

async function importTeachers(client: any, rows: Row[]) {
  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const { data: schools } = await client.from('schools').select('id,school_code');
  const schoolMap = new Map((schools || []).map((s: any) => [String(s.school_code), s.id]));
  const roles = new Set(['مدير','معلم','إداري','مستخدم','حارس']);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], line = i + 2;
    const schoolCode = cleanSchoolCode(text(row,'school_code','رمز المدرسة','كود المدرسة'));
    const schoolId = schoolMap.get(schoolCode);
    const full_name = text(row,'full_name','اسم الموظف','الاسم');
    const national_id = cleanNationalId(text(row,'national_id','رقم الهوية','السجل المدني','رقم الهوية / السجل المدني'));
    const job_role = text(row,'job_role','الوظيفة','المسمى الوظيفي') || 'معلم';
    if (!schoolId || !full_name || !/^\d{10}$/.test(national_id) || !roles.has(job_role)) {
      skipped++;
      errors.push(`صف ${line}: تحقق من رمز المدرسة والاسم والسجل المدني (10 أرقام) والوظيفة.`);
      continue;
    }
    const payload = { school_id: schoolId, full_name, national_id, job_role, specialization: text(row,'specialization','التخصص') || null, is_active: bool(row,'is_active','الحالة') };
    const { data: existing } = await client.from('teachers').select('id').eq('national_id', national_id).maybeSingle();
    const { error } = existing
      ? await client.from('teachers').update(payload).eq('id', existing.id)
      : await client.from('teachers').insert(payload);
    if (error) { skipped++; errors.push(`صف ${line}: ${error.message}`); }
    else existing ? updated++ : added++;
  }
  return { added, updated, skipped, errors };
}

async function importAccounts(client: any, rows: Row[]) {
  let added = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const { data: schools } = await client.from('schools').select('id,school_code,is_active,school_name');
  const schoolMap = new Map<string, SchoolAccountImport>();
  for (const s of schools || []) {
    if (s && typeof s === 'object') {
      const row = s as Record<string, unknown>;
      schoolMap.set(String(row.school_code ?? ''), {
        id: String(row.id ?? ''),
        school_code: String(row.school_code ?? ''),
        is_active: Boolean(row.is_active),
        school_name: String(row.school_name ?? ''),
      });
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], line = i + 2;
    const schoolCode = text(row,'school_code','رمز المدرسة','كود المدرسة');
    const school = schoolMap.get(schoolCode);
    const username = text(row,'username','اسم المستخدم').toLowerCase();
    const password = text(row,'password','كلمة المرور');
    const display_name = text(row,'display_name','اسم مسؤول الحساب','مسؤول الحساب');
    const is_active = bool(row,'is_active','الحالة');
    if (!school || !username) { skipped++; errors.push(`صف ${line}: رمز المدرسة واسم المستخدم مطلوبان.`); continue; }
    if (!school.is_active && is_active) { skipped++; errors.push(`صف ${line}: المدرسة غير مفعلة، لا يمكن تفعيل حسابها.`); continue; }
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) { skipped++; errors.push(`صف ${line}: اسم المستخدم غير صالح.`); continue; }
    if (password && password.length < 8) { skipped++; errors.push(`صف ${line}: كلمة المرور يجب أن تكون 8 أحرف على الأقل.`); continue; }

    const email = `${username}@schools.ceedu.local`;
    const { data: existingByUsername } = await client.from('school_users').select('id,auth_user_id').eq('username', username).maybeSingle();
    const { data: existingBySchool } = await client.from('school_users').select('id,auth_user_id,username').eq('school_id', school.id).maybeSingle();
    const existing = existingByUsername || existingBySchool;

    if (existing) {
      if (!existing.auth_user_id) {
        skipped++;
        errors.push(`صف ${line}: حساب المدرسة موجود في قاعدة البيانات لكن لا يرتبط بحساب دخول صالح. أنشئ/صحح الحساب من إدارة حسابات المدارس.`);
        continue;
      }
      const authPayload: { email: string; email_confirm: boolean; password?: string } = {
        email,
        email_confirm: true,
      };
      if (password) authPayload.password = password;

      const { error: authError } = await client.auth.admin.updateUserById(
        existing.auth_user_id,
        authPayload
      );
      if (authError) { skipped++; errors.push(`صف ${line}: تعذر تحديث حساب الدخول: ${authError.message}`); continue; }

      const { error } = await client.from('school_users').update({
        school_id: school.id,
        username,
        display_name: display_name || school.school_name,
        is_active
      }).eq('id', existing.id);
      if (error) { skipped++; errors.push(`صف ${line}: ${error.message}`); } else updated++;
      continue;
    }

    if (!password) { skipped++; errors.push(`صف ${line}: كلمة المرور مطلوبة لإنشاء حساب جديد.`); continue; }

    const { data: created, error: createError } = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) { skipped++; errors.push(`صف ${line}: ${createError?.message || 'تعذر إنشاء الحساب.'}`); continue; }
    const { error: mapError } = await client.from('school_users').insert({ auth_user_id: created.user.id, school_id: school.id, username, display_name: display_name || school.school_name, is_active });
    if (mapError) {
      await client.auth.admin.deleteUser(created.user.id);
      skipped++; errors.push(`صف ${line}: ${mapError.message}`);
    } else added++;
  }
  return { added, updated, skipped, errors };
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if ('error' in auth) return auth.error;
    const form = await request.formData();
    const file = form.get('file');
    const mode = String(form.get('mode') || '');
    if (!(file instanceof File)) return NextResponse.json({ error: 'اختر ملف Excel أولًا.' }, { status: 400 });
    if (!['schools','teachers','accounts'].includes(mode)) return NextResponse.json({ error: 'نوع الاستيراد غير صحيح.' }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return NextResponse.json({ error: 'يرجى رفع ملف Excel بصيغة XLSX أو XLS أو CSV.' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'حجم الملف يتجاوز 10MB.' }, { status: 400 });

    let rows: Row[];
    try {
      rows = parseWorkbook(await file.arrayBuffer());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `تعذر قراءة ملف Excel: ${message}` }, { status: 400 });
    }
    if (!rows.length) return NextResponse.json({ error: 'ورقة Excel فارغة أو لا تحتوي على صفوف بيانات.' }, { status: 400 });

    const result = mode === 'schools'
      ? await importSchools(auth.client, rows)
      : mode === 'teachers'
        ? await importTeachers(auth.client, rows)
        : await importAccounts(auth.client, rows);

    return NextResponse.json({ success: true, mode, total: rows.length, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' }, { status: 500 });
  }
}
