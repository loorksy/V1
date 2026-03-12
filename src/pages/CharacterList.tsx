import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, User, Ghost, Smile, Cat, Dna } from 'lucide-react';
import { db, Character } from '../lib/db';

export default function CharacterList() {
  const [characters, setCharacters] = useState<Character[]>([]);

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    const chars = await db.getAllCharacters();
    setCharacters(chars.sort((a, b) => b.createdAt - a.createdAt));
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5 pb-24 lg:pb-8">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-foreground">شخصياتي</h1>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { to: '/funny-humans/new', icon: Smile, label: 'مضحكة', color: 'bg-orange-500' },
          { to: '/creature-characters/new', icon: Cat, label: 'مخلوق', color: 'bg-teal-600' },
          { to: '/hybrid-characters/new', icon: Dna, label: 'هجينة', color: 'bg-rose-500' },
          { to: '/surreal-characters/new', icon: Ghost, label: 'خيالية', color: 'bg-emerald-600' },
        ].map(item => (
          <Link 
            key={item.to}
            to={item.to} 
            className={`${item.color} text-white py-2.5 px-1 rounded-xl font-semibold text-[10px] flex flex-col items-center justify-center gap-1 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all text-center active:scale-[0.98]`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {characters.map((char) => (
          <div key={char.id} className="bg-card rounded-2xl overflow-hidden border border-border/60 hover:shadow-md transition-all group">
            <div className="aspect-square bg-muted relative overflow-hidden">
              {char.images.front ? (
                <img src={char.images.front} alt={char.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                  <User className="w-10 h-10" />
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-card-foreground truncate text-sm">{char.name}</h3>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{char.description}</p>
            </div>
          </div>
        ))}
        
        {characters.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium text-sm">لا توجد شخصيات بعد</p>
            <p className="text-xs text-muted-foreground/60 mt-1">اضغط على الأزرار بالأعلى لإنشاء شخصية</p>
          </div>
        )}
      </div>
    </div>
  );
}
