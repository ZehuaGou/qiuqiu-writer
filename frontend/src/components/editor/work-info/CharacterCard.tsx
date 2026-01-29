
import React from 'react';
import type { ComponentConfig } from './types';

interface CharacterCardProps {
  component: ComponentConfig;
  onChange: (newValue: any) => void;
  isEditMode: boolean;
}

export default function CharacterCard({
  component,
  onChange,
  isEditMode
}: CharacterCardProps) {
  const value = (typeof component.value === 'object' && component.value !== null 
    ? component.value 
    : {}) as Record<string, any>;
    
  const fields = component.config.cardFields || [
    { key: 'name', label: '姓名', type: 'text' },
    { key: 'gender', label: '性别', type: 'text' },
    { key: 'age', label: '年龄', type: 'text' },
    { key: 'role', label: '定位', type: 'text' },
    { key: 'description', label: '简介', type: 'textarea' }
  ];

  const updateField = (key: string, val: any) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div className="character-card">
      {fields.map(field => (
        <div key={field.key} className="character-field">
          <label>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              value={value[field.key] || ''}
              onChange={e => updateField(field.key, e.target.value)}
              disabled={!isEditMode && false}
              placeholder={`请输入${field.label}`}
            />
          ) : field.type === 'image' ? (
             <div className="field-image">
               {value[field.key] ? (
                 <div className="image-preview">
                   <img src={value[field.key]} alt={field.label} />
                   {isEditMode && (
                     <button onClick={() => updateField(field.key, '')}>删除</button>
                   )}
                 </div>
               ) : (
                 isEditMode && <button className="upload-btn">上传图片</button>
               )}
             </div>
          ) : (
            <input
              type="text"
              value={value[field.key] || ''}
              onChange={e => updateField(field.key, e.target.value)}
              disabled={!isEditMode && false}
              placeholder={`请输入${field.label}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
