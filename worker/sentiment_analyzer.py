#!/usr/bin/env python3
import sys
import json
import os
from transformers import pipeline
import warnings

warnings.filterwarnings('ignore')

class SentimentAnalyzer:
    def __init__(self):
        self.sentiment_model = os.getenv('HUGGINGFACE_MODEL', 'distilbert-base-uncased-finetuned-sst-2-english')
        self.emotion_model = os.getenv('EMOTION_MODEL', 'j-hartmann/emotion-english-distilroberta-base')
        
        # Initialize pipelines
        self.sentiment_pipeline = pipeline(
            "text-classification",
            model=self.sentiment_model,
            device=-1  # CPU
        )
        
        self.emotion_pipeline = pipeline(
            "text-classification",
            model=self.emotion_model,
            device=-1  # CPU
        )
    
    def analyze_sentiment(self, text):
        """Analyze sentiment of text"""
        if not text or len(text.strip()) == 0:
            return {
                'sentiment_label': 'neutral',
                'confidence_score': 0.5,
                'model_name': self.sentiment_model
            }
        
        # Truncate to 512 tokens
        truncated_text = text[:512]
        
        result = self.sentiment_pipeline(truncated_text)[0]
        
        # Map labels to standard format
        label_map = {
            'POSITIVE': 'positive',
            'NEGATIVE': 'negative',
            'NEUTRAL': 'neutral',
            'LABEL_0': 'negative',
            'LABEL_1': 'neutral',
            'LABEL_2': 'positive'
        }
        
        label = result['label'].upper()
        sentiment_label = label_map.get(label, 'neutral')
        
        return {
            'sentiment_label': sentiment_label,
            'confidence_score': round(result['score'], 4),
            'model_name': self.sentiment_model
        }
    
    def analyze_emotion(self, text):
        """Detect emotion in text"""
        if not text or len(text.strip()) < 10:
            return {
                'emotion': 'neutral',
                'confidence_score': 0.5,
                'model_name': self.emotion_model
            }
        
        truncated_text = text[:512]
        
        result = self.emotion_pipeline(truncated_text)[0]
        
        # Map to standard emotions
        emotion_map = {
            'joy': 'joy',
            'happiness': 'joy',
            'sadness': 'sadness',
            'sad': 'sadness',
            'anger': 'anger',
            'angry': 'anger',
            'fear': 'fear',
            'scared': 'fear',
            'surprise': 'surprise',
            'surprised': 'surprise',
            'neutral': 'neutral',
            'disgust': 'anger'
        }
        
        emotion = result['label'].lower()
        standard_emotion = emotion_map.get(emotion, emotion)
        
        return {
            'emotion': standard_emotion,
            'confidence_score': round(result['score'], 4),
            'model_name': self.emotion_model
        }

def main():
    analyzer = SentimentAnalyzer()
    
    # Read input from stdin
    for line in sys.stdin:
        try:
            data = json.loads(line.strip())
            text = data.get('text', '')
            
            sentiment = analyzer.analyze_sentiment(text)
            emotion = analyzer.analyze_emotion(text)
            
            result = {
                'sentiment': sentiment,
                'emotion': emotion
            }
            
            print(json.dumps(result), flush=True)
        except Exception as e:
            error_result = {
                'error': str(e),
                'sentiment': {
                    'sentiment_label': 'neutral',
                    'confidence_score': 0.0,
                    'model_name': 'error'
                },
                'emotion': {
                    'emotion': 'neutral',
                    'confidence_score': 0.0,
                    'model_name': 'error'
                }
            }
            print(json.dumps(error_result), flush=True)

if __name__ == '__main__':
    main()