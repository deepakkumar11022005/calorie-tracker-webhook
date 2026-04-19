import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function logMeal(phone: string, mealData: any) {
    console.log(`Logging meal for ${phone}: ${mealData.dish}`);
    await supabase.from('users').upsert({ phone: phone }, { onConflict: 'phone', ignoreDuplicates: true });

    const { data, error } = await supabase.from('meals').insert({
        phone: phone,
        dish: mealData.dish,
        kcal: mealData.kcal,
        protein_g: mealData.protein_g,
        carbs_g: mealData.carbs_g,
        fat_g: mealData.fat_g
    });

    if (error) throw error;
    return data;
}

export async function getUserGoal(phone: string): Promise<number> {
    const { data, error } = await supabase.from('users').select('daily_goal_kcal').eq('phone', phone).single();
    if (error || !data || !data.daily_goal_kcal) return 2000;
    return data.daily_goal_kcal;
}

export async function getDailyKcalSum(phone: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase.from('meals').select('kcal').eq('phone', phone).gte('logged_at', today.toISOString());
    if (error) return 0;

    return data.reduce((sum, row) => sum + row.kcal, 0);
}

export async function getMealsForToday(phone: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase.from('meals').select('dish, kcal, protein_g, carbs_g, fat_g').eq('phone', phone).gte('logged_at', today.toISOString()).order('logged_at', { ascending: true });

    if (error || !data || data.length === 0) return "No meals logged today.";
    return data.map(m => `- ${m.dish}: ${m.kcal}kcal (P:${m.protein_g}g, C:${m.carbs_g}g, F:${m.fat_g}g)`).join('\n');
}

export async function getStreakAndWeekly(phone: string, goal: number): Promise<{ streak: number, weeklySummary: string }> {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('meals')
        .select('kcal, logged_at')
        .eq('phone', phone)
        .gte('logged_at', lastWeek.toISOString())
        .order('logged_at', { ascending: false });

    if (error || !data || data.length === 0) return { streak: 0, weeklySummary: "No data for the past week." };

    const days: Record<string, number> = {};
    for (const row of data) {
        const dateStr = new Date(row.logged_at).toISOString().split('T')[0];
        days[dateStr] = (days[dateStr] || 0) + row.kcal;
    }

    const sortedDates = Object.keys(days).sort((a, b) => b.localeCompare(a));

    let streak = 0;
    for (const day of sortedDates) {
        if (days[day] > 0 && days[day] <= goal) streak++;
        else if (days[day] > goal) break;
    }

    let weekSummary = `📅 *Last 7 Days:*`;
    let count = 0;
    for (const day of sortedDates) {
        if (count >= 7) break;
        const status = (days[day] <= goal) ? '✅' : '⚠️';
        weekSummary += `\n${day}: ${days[day]} kcal ${status}`;
        count++;
    }

    return { streak, weeklySummary: weekSummary };
}
